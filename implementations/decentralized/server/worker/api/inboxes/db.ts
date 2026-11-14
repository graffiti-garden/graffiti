import { DATABASE_NOW_MS, EXPIRED_MESSAGE_SQL } from "./retention";
import type { Context } from "hono";
import type { Bindings } from "../../env";
import {
  encode as dagCborEncode,
  decode as dagCborDecode,
} from "@ipld/dag-cbor";
import { HTTPException } from "hono/http-exception";
import { LRUCache } from "lru-cache";
import z from "zod";
import { Validator, type Schema } from "@cfworker/json-schema";
import { randomBase64, encodeBase64 } from "../../app/auth/utils";

const INBOX_QUERY_LIMIT = 100;
const INBOX_INFO_CACHE_CAPACITY = 1000;

const GraffitiObjectSchema = z
  .object({
    value: z.looseObject({}),
    channels: z.array(z.string()),
    allowed: z.array(z.url()).nullable().optional(),
    url: z.url(),
    actor: z.url(),
  })
  .strict();
export const Uint8ArraySchema = z
  .custom<Uint8Array>((v): v is Uint8Array => v instanceof Uint8Array)
  .openapi({
    type: "string",
    description: "A byte array",
  });
export const TagsSchema = z
  .array(Uint8ArraySchema)
  .refine(
    (tags) => {
      const unique = new Set(tags.map(encodeBase64));
      return unique.size === tags.length;
    },
    {
      message: "Tags must be unique",
    },
  )
  .openapi({
    description:
      "A set of per-message tags. A message can only be queried by specifying one of its tags",
  });
export const MessageSchema = z
  .object({
    t: TagsSchema,
    o: GraffitiObjectSchema,
    m: Uint8ArraySchema,
  })
  .strict();
export const InboxMessageSchema = z.object({
  id: z.string(),
  m: MessageSchema,
});

const inboxInfoCache = new LRUCache<
  string,
  { value: { accountId: number; inboxSeq: number } | null }
>({ max: INBOX_INFO_CACHE_CAPACITY });

async function getInboxInfo(
  context: Context<{ Bindings: Bindings }>,
  inboxId: string,
) {
  if (inboxId === "shared")
    return {
      accountId: 0,
      inboxSeq: 0,
    };

  const cached = inboxInfoCache.get(inboxId);

  if (cached) {
    return cached.value;
  } else {
    const result = await context.env.DB.prepare(
      "SELECT account_id, inbox_seq FROM inboxes WHERE inbox_id = ?",
    )
      .bind(inboxId)
      .first<{ account_id: number; inbox_seq: number }>();

    const output = result
      ? {
          accountId: result.account_id,
          inboxSeq: result.inbox_seq,
        }
      : null;

    inboxInfoCache.set(inboxId, { value: output });

    return output;
  }
}

export async function sendMessage(
  context: Context<{ Bindings: Bindings }>,
  inboxId: string,
  message: z.infer<typeof MessageSchema>,
  messageId_?: string,
) {
  // Check that the target inbox exists.
  const info = await getInboxInfo(context, inboxId);
  if (!info) {
    throw new HTTPException(404, { message: "Inbox not found" });
  }
  const inboxSeq = info.inboxSeq;

  // Hash the message to prevent inserting duplicates
  const operationBytes = dagCborEncode({ inboxSeq, ...message });
  const messageHash = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(operationBytes),
  );

  const messageId = messageId_ ?? randomBase64();
  const database = context.env.DB;
  // Arrival, sequence allocation, and tag indexing commit together. A query
  // cannot advance past a message whose tags have not yet been inserted.
  const statements = [
    database.prepare(`DELETE FROM inbox_messages AS m WHERE hash = ? AND ${EXPIRED_MESSAGE_SQL}`).bind(messageHash),
    database.prepare(`UPDATE inbox_sequence
      SET value = MAX(value, (SELECT COALESCE(MAX(message_seq), 0) FROM inbox_messages)) + 1 WHERE id = 1`),
    database.prepare(`INSERT INTO inbox_messages
      (message_seq, message_id, hash, inbox_seq, tags, object, metadata, created_at)
      VALUES ((SELECT value FROM inbox_sequence WHERE id = 1), ?, ?, ?, ?, ?, ?, ${DATABASE_NOW_MS})
      ON CONFLICT(hash) DO NOTHING RETURNING message_id`)
      .bind(messageId, messageHash, inboxSeq, dagCborEncode(message.t), JSON.stringify(message.o), dagCborEncode(message.m)),
    ...message.t.map((tag) => database.prepare(`INSERT INTO inbox_message_tags (message_seq, inbox_seq, tag)
      SELECT message_seq, inbox_seq, ? FROM inbox_messages WHERE hash = ?
      ON CONFLICT (message_seq, tag) DO NOTHING`).bind(tag, messageHash)),
    database.prepare("SELECT message_id FROM inbox_messages WHERE hash = ?").bind(messageHash),
  ];
  const results = await database.batch<{ message_id: string }>(statements);
  const stored = results[results.length - 1].results[0];
  if (!stored) throw new HTTPException(500, { message: "Message was not stored" });
  return { messageId: stored.message_id, created: results[2].results.length > 0 };
}

export async function queryMessages(
  context: Context<{ Bindings: Bindings }>,
  inboxId: string,
  tags: Uint8Array[],
  objectSchema: Schema | boolean,
  accountId?: number,
  sinceSeq: number = 0,
  limit: number = INBOX_QUERY_LIMIT,
) {
  if (tags.length === 0)
    return { results: [], hasMore: false, lastSeq: sinceSeq };

  let objectValidator: Validator;
  try {
    objectValidator = new Validator(objectSchema, "2020-12");
  } catch (error) {
    throw new HTTPException(400, {
      message: `Error compiling schema: ${error instanceof Error ? error.message : "unknown"}`,
    });
  }

  const info = await getInboxInfo(context, inboxId);
  if (!info || !(info.accountId === accountId || info.accountId === 0)) {
    throw new HTTPException(403, {
      message: "Cannot query someone else's inbox",
    });
  }
  const inboxSeq = info.inboxSeq;

  const sql = [
    `WITH message_candidates AS (
      SELECT DISTINCT t.message_seq
      FROM inbox_message_tags t
      WHERE t.inbox_seq = ? AND t.tag IN (${tags.map(() => "?").join(", ")})
        AND t.message_seq > ?
      ORDER BY t.message_seq ASC
    )
    SELECT
      m.message_seq,
      m.message_id,
      m.tags,
      m.object,
      m.metadata
    FROM message_candidates c
    JOIN inbox_messages m
      ON m.message_seq = c.message_seq
    WHERE NOT (${EXPIRED_MESSAGE_SQL})`,
    `ORDER BY m.message_seq ASC
    LIMIT ?`,
  ].join("\n");

  const bindings = [
    inboxSeq,
    ...tags,
    sinceSeq,
    limit + 1,
  ];

  const res = await context.env.DB.prepare(sql)
    .bind(...bindings)
    .all<{
      message_seq: number;
      message_id: string;
      tags: ArrayBuffer;
      object: string;
      metadata: ArrayBuffer;
    }>();

  const hasMore = res.results.length === limit + 1;
  const resultsRaw = res.results.slice(0, limit);

  const lastSeq = resultsRaw.length
    ? resultsRaw[resultsRaw.length - 1].message_seq
    : sinceSeq;

  const results = resultsRaw
    .map((r) => {
      const messageRaw = {
        t: dagCborDecode(new Uint8Array(r.tags)),
        o: JSON.parse(r.object),
        m: dagCborDecode(new Uint8Array(r.metadata)),
      };
      const message = MessageSchema.parse(messageRaw);
      const envelope: z.infer<typeof InboxMessageSchema> = {
        id: r.message_id,
        m: message,
      };
      return envelope;
    })
    .filter((r) => objectValidator.validate(r.m.o).valid);

  return {
    results,
    hasMore,
    lastSeq,
  };
}

export async function setMessagePins(
  context: Context<{ Bindings: Bindings }>,
  inboxId: string,
  messageIds: string[],
  accountId: number,
  pinned: boolean,
) {
  const info = await getInboxInfo(context, inboxId);
  if (!info || !(info.accountId === accountId || info.accountId === 0)) {
    throw new HTTPException(403, { message: "Cannot pin messages in someone else's inbox" });
  }
  const ids = [...new Set(messageIds)];
  // JSON keeps a batch within D1's bound-parameter limit.
  const encodedIds = JSON.stringify(ids);
  if (!pinned) {
    // Removing one's own pin is idempotent, even after an entry disappears.
    await context.env.DB.prepare(`
      DELETE FROM inbox_message_pins
      WHERE account_id = ? AND message_seq IN (
        SELECT message_seq FROM inbox_messages
        WHERE inbox_seq = ? AND message_id IN (SELECT value FROM json_each(?))
      )
    `).bind(accountId, info.inboxSeq, encodedIds).run();
    return;
  }

  const matching = `SELECT m.message_seq FROM inbox_messages m
    WHERE m.inbox_seq = ? AND m.message_id IN (SELECT value FROM json_each(?))
      AND NOT (${EXPIRED_MESSAGE_SQL})`;
  // Validate and insert in one transaction. A batch with any missing ID pins
  // nothing; retrying a successful batch leaves the existing pins unchanged.
  const [, count] = await context.env.DB.batch<{ count: number }>([
    context.env.DB.prepare(`
      INSERT INTO inbox_message_pins (message_seq, account_id)
      SELECT message_seq, ? FROM (${matching})
      WHERE (SELECT COUNT(*) FROM (${matching})) = ?
      ON CONFLICT (message_seq, account_id) DO NOTHING
    `).bind(accountId, info.inboxSeq, encodedIds, info.inboxSeq, encodedIds, ids.length),
    // Check after insertion: the deadline can pass between SQL statements.
    // Successfully pinned entries remain live; expired unpinned ones must fail.
    context.env.DB.prepare(`SELECT COUNT(*) AS count FROM (${matching})`)
      .bind(info.inboxSeq, encodedIds),
  ]);
  if (count.results[0]?.count !== ids.length) {
    throw new HTTPException(404, { message: "Message not found" });
  }
}

export async function exportMessages(
  context: Context<{ Bindings: Bindings }>,
  inboxId: string,
  accountId: number,
  sinceSeq: number = 0,
) {
  const info = await getInboxInfo(context, inboxId);
  if (info?.inboxSeq === 0) {
    throw new HTTPException(403, {
      message: "Cannot export from the shared inbox",
    });
  }
  if (!info || info.accountId !== accountId) {
    throw new HTTPException(403, {
      message: "Cannot export from someone else's inbox",
    });
  }
  const inboxSeq = info.inboxSeq;

  const res = await context.env.DB.prepare(
    `
    SELECT
      inbox_messages.message_seq,
      message_id,
      tags,
      object,
      metadata
    FROM inbox_messages
    WHERE inbox_seq = ? AND inbox_messages.message_seq > ?
    ORDER BY inbox_messages.message_seq ASC
    LIMIT ?
  `,
  )
    .bind(inboxSeq, sinceSeq, INBOX_QUERY_LIMIT + 1)
    .all<{
      message_seq: number;
      message_id: string;
      tags: ArrayBuffer;
      object: string;
      metadata: ArrayBuffer;
    }>();

  const hasMore = res.results.length === INBOX_QUERY_LIMIT + 1;
  const resultsRaw = res.results.slice(0, INBOX_QUERY_LIMIT);

  const lastSeq = resultsRaw.length
    ? resultsRaw[resultsRaw.length - 1].message_seq
    : sinceSeq;

  const results = resultsRaw.map((r) => {
    const messageRaw = {
      t: dagCborDecode(new Uint8Array(r.tags)),
      o: JSON.parse(r.object),
      m: dagCborDecode(new Uint8Array(r.metadata)),
    };
    const message = MessageSchema.parse(messageRaw);
    const envelope: z.infer<typeof InboxMessageSchema> = {
      id: r.message_id,
      m: message,
    };
    return envelope;
  });

  return {
    results,
    lastSeq,
    hasMore,
  };
}
