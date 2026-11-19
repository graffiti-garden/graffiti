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
export const LabeledMessageSchema = z.object({
  id: z.string(),
  m: MessageSchema,
  l: z.number(),
});
export const PINNED_BY_ME_KEY = "p";
export const QueryMessageSchema = LabeledMessageSchema.extend({
  [PINNED_BY_ME_KEY]: z.boolean().openapi({
    description: "Whether the authenticated account pins this entry. False for anonymous queries.",
  }),
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
  // Determine if the inbox is under the account's control,
  // which we will later use to determine if we can label the message
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

  let messageId = messageId_ ?? randomBase64();

  const inserted = await context.env.DB.prepare(
    `
      INSERT INTO inbox_messages (
        message_id,
        hash,
        inbox_seq,
        tags,
        object,
        metadata
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(hash) DO NOTHING
      RETURNING message_seq;
    `,
  )
    .bind(
      messageId,
      messageHash,
      inboxSeq,
      dagCborEncode(message.t),
      JSON.stringify(message.o),
      dagCborEncode(message.m),
    )
    .first<{ message_seq: number }>();

  let created: boolean;
  let messageSeq: number;
  if (inserted) {
    created = true;
    messageSeq = inserted.message_seq;
  } else {
    created = false;
    const result = await context.env.DB.prepare(
      `SELECT message_seq, message_id FROM inbox_messages WHERE inbox_seq = ? AND hash = ?`,
    )
      .bind(inboxSeq, messageHash)
      .first<{ message_seq: number; message_id: string }>();
    if (!result) {
      throw new HTTPException(500, {
        message: "Duplicate message deleted during send?",
      });
    }
    messageSeq = result.message_seq;
    messageId = result.message_id;
  }

  const statements: D1PreparedStatement[] = [];

  if (created) {
    for (const tag of message.t) {
      statements.push(
        context.env.DB.prepare(
          `
          INSERT INTO inbox_message_tags (
            message_seq,
            inbox_seq,
            tag
          ) VALUES (?, ?, ?);
        `,
        ).bind(messageSeq, inboxSeq, tag),
      );
    }
    await context.env.DB.batch(statements);
  }

  return { messageId, created };
}

export async function getMessage(
  context: Context<{ Bindings: Bindings }>,
  inboxId: string,
  messageId: string,
  accountId?: number,
) {
  const info = await getInboxInfo(context, inboxId);

  if (!info || !(info.accountId === accountId || info.accountId === 0)) {
    throw new HTTPException(403, {
      message: "Cannot read someone else's inbox",
    });
  }
  const inboxSeq = info.inboxSeq;

  const res = await context.env.DB.prepare(
    `
  SELECT
    tags,
    object,
    metadata,
    l.label AS label
  FROM inbox_messages m
  LEFT JOIN inbox_message_labels l
    ON m.message_seq = l.message_seq AND l.account_id = ?
  WHERE inbox_seq = ? AND message_id = ?
  `,
  )
    .bind(accountId, inboxSeq, messageId)
    .first<{
      tags: ArrayBuffer;
      object: string;
      metadata: ArrayBuffer;
      label: number | null;
    }>();

  if (!res) {
    throw new HTTPException(404, { message: "Message not found" });
  }

  const messageRaw = {
    t: dagCborDecode(new Uint8Array(res.tags)),
    o: JSON.parse(res.object),
    m: dagCborDecode(new Uint8Array(res.metadata)),
  };

  const message = MessageSchema.parse(messageRaw);

  const out: z.infer<typeof LabeledMessageSchema> = {
    id: messageId,
    m: message,
    l: res.label ?? 0,
  };

  return out;
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
      m.metadata,`,
    accountId
      ? `EXISTS (SELECT 1 FROM inbox_message_pins p
          WHERE p.message_seq = m.message_seq AND p.account_id = ?) AS pinned_by_me,`
      : `0 AS pinned_by_me,`,
    accountId ? `l.label AS label` : `NULL as label`,
    `FROM message_candidates c
    JOIN inbox_messages m
      ON m.message_seq = c.message_seq`,
    accountId
      ? `LEFT JOIN inbox_message_labels l
      ON c.message_seq = l.message_seq AND l.account_id = ?`
      : ``,
    `ORDER BY m.message_seq ASC
    LIMIT ?`,
  ].join("\n");

  const bindings = [
    inboxSeq,
    ...tags,
    sinceSeq,
    ...(accountId ? [accountId, accountId] : []),
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
      label: number | null;
      pinned_by_me: number;
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
      const messageWithLabel: z.infer<typeof QueryMessageSchema> = {
        id: r.message_id,
        m: message,
        l: r.label ?? 0,
        [PINNED_BY_ME_KEY]: r.pinned_by_me === 1,
      };
      return messageWithLabel;
    })
    .filter((r) => objectValidator.validate(r.m.o).valid);

  return {
    results,
    hasMore,
    lastSeq,
  };
}

export async function labelMessage(
  context: Context<{ Bindings: Bindings }>,
  inboxId: string,
  messageId: string,
  label: number,
  accountId: number,
) {
  const info = await getInboxInfo(context, inboxId);
  if (!info || !(info.accountId === accountId || info.accountId === 0)) {
    throw new HTTPException(403, {
      message: "Cannot label a message in someone else's inbox",
    });
  }
  const inboxSeq = info.inboxSeq;

  // Make sure the message is in the indbox
  const result = await context.env.DB.prepare(
    `SELECT message_seq FROM inbox_messages WHERE inbox_seq = ? AND message_id = ?`,
  )
    .bind(inboxSeq, messageId)
    .first<{ message_seq: number }>();
  if (!result) {
    throw new HTTPException(404, {
      message: "Message not found",
    });
  }
  const messageSeq = result.message_seq;

  await context.env.DB.prepare(
    `
    INSERT INTO inbox_message_labels (
      message_seq,
      account_id,
      label
    ) VALUES (?, ?, ?)
    ON CONFLICT (message_seq, account_id) DO UPDATE SET label = EXCLUDED.label;
  `,
  )
    .bind(messageSeq, accountId, label)
    .run();
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

  const matching = `SELECT message_seq FROM inbox_messages
    WHERE inbox_seq = ? AND message_id IN (SELECT value FROM json_each(?))`;
  // Validate and insert in one transaction. A batch with any missing ID pins
  // nothing; retrying a successful batch leaves the existing pins unchanged.
  const [count] = await context.env.DB.batch<{ count: number }>([
    context.env.DB.prepare(`SELECT COUNT(*) AS count FROM (${matching})`)
      .bind(info.inboxSeq, encodedIds),
    context.env.DB.prepare(`
      INSERT INTO inbox_message_pins (message_seq, account_id)
      SELECT message_seq, ? FROM (${matching})
      WHERE (SELECT COUNT(*) FROM (${matching})) = ?
      ON CONFLICT (message_seq, account_id) DO NOTHING
    `).bind(accountId, info.inboxSeq, encodedIds, info.inboxSeq, encodedIds, ids.length),
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
      metadata,
      EXISTS (SELECT 1 FROM inbox_message_pins p
        WHERE p.message_seq = inbox_messages.message_seq AND p.account_id = ?) AS pinned_by_me,
      l.label AS label
    FROM inbox_messages
    LEFT JOIN inbox_message_labels l
      ON inbox_messages.message_seq = l.message_seq AND l.account_id = ?
    WHERE inbox_seq = ? AND inbox_messages.message_seq > ?
    ORDER BY inbox_messages.message_seq ASC
    LIMIT ?
  `,
  )
    .bind(accountId, accountId, inboxSeq, sinceSeq, INBOX_QUERY_LIMIT + 1)
    .all<{
      message_seq: number;
      message_id: string;
      tags: ArrayBuffer;
      object: string;
      metadata: ArrayBuffer;
      label: number | null;
      pinned_by_me: number;
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
    const messageWithLabel: z.infer<typeof QueryMessageSchema> = {
      id: r.message_id,
      m: message,
      l: r.label ?? 0,
      [PINNED_BY_ME_KEY]: r.pinned_by_me === 1,
    };
    return messageWithLabel;
  });

  return {
    results,
    lastSeq,
    hasMore,
  };
}
