import type { Context } from "hono";
import type { Bindings } from "../../env";
import {
  encode as dagCborEncode,
  decode as dagCborDecode,
} from "@ipld/dag-cbor";
import { HTTPException } from "hono/http-exception";
import { LRUCache } from "lru-cache";
import z from "zod";
import { Validator } from "@cfworker/json-schema";

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
export const TagsSchema = z.array(Uint8ArraySchema).openapi({
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

const inboxInfoCache = new LRUCache<
  string,
  { value: { userId: number; inboxSeq: number } | null }
>({ max: INBOX_INFO_CACHE_CAPACITY });

async function getInboxInfo(
  context: Context<{ Bindings: Bindings }>,
  inboxId: string,
) {
  if (inboxId === "shared")
    return {
      userId: 0,
      inboxSeq: 0,
    };

  const cached = inboxInfoCache.get(inboxId);

  if (cached) {
    return cached.value;
  } else {
    const result = await context.env.DB.prepare(
      "SELECT user_id, inbox_seq FROM inboxes WHERE inbox_id = ?",
    )
      .bind(inboxId)
      .first<{ user_id: number; inbox_seq: number }>();

    const output = result
      ? {
          userId: result.user_id,
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
) {
  // Determine if the inbox is under the user's control,
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

  const inserted = await context.env.DB.prepare(
    `
      INSERT INTO inbox_messages (
        hash,
        inbox_seq,
        tags,
        object,
        metadata
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(hash) DO NOTHING
      RETURNING seq;
    `,
  )
    .bind(
      messageHash,
      inboxSeq,
      dagCborEncode(message.t),
      JSON.stringify(message.o),
      dagCborEncode(message.m),
    )
    .first<{ seq: number }>();

  let created: boolean;
  let messageSeq: number;
  if (inserted) {
    created = true;
    messageSeq = inserted.seq;
  } else {
    created = false;
    const result = await context.env.DB.prepare(
      `SELECT seq FROM inbox_messages WHERE inbox_seq = ? AND hash = ?`,
    )
      .bind(inboxSeq, messageHash)
      .first<{ seq: number }>();
    if (!result) {
      throw new HTTPException(500, {
        message: "Duplicate message deleted during send?",
      });
    }
    messageSeq = result.seq;
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

  return { messageId: messageSeq.toString(), created };
}

export async function queryMessages(
  context: Context<{ Bindings: Bindings }>,
  inboxId: string,
  tags: Uint8Array[],
  objectSchema: {},
  userId?: number,
  sinceSeq: number = 0,
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
  if (!info || !(info.userId === userId || info.userId === 0)) {
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
      m.seq,
      m.tags,
      m.object,
      m.metadata,`,
    userId ? `l.label AS label` : `NULL as label`,
    `FROM message_candidates c
    JOIN inbox_messages m
      ON m.seq = c.message_seq`,
    userId
      ? `LEFT JOIN inbox_message_labels l
      ON c.message_seq = l.message_seq AND l.user_id = ?`
      : ``,
    `ORDER BY m.seq ASC
    LIMIT ?`,
  ].join("\n");

  const bindings = [
    inboxSeq,
    ...tags,
    sinceSeq,
    ...(userId ? [userId] : []),
    INBOX_QUERY_LIMIT + 1,
  ];

  const res = await context.env.DB.prepare(sql)
    .bind(...bindings)
    .all<{
      seq: number;
      tags: ArrayBuffer;
      object: string;
      metadata: ArrayBuffer;
      label: number | null;
    }>();

  const hasMore = res.results.length === INBOX_QUERY_LIMIT + 1;
  const resultsRaw = res.results.slice(0, INBOX_QUERY_LIMIT);

  const lastSeq = resultsRaw.reduce((maxSeq, r) => Math.max(maxSeq, r.seq), 0);

  const results = resultsRaw
    .map((r) => {
      const messageRaw = {
        t: dagCborDecode(new Uint8Array(r.tags)),
        o: JSON.parse(r.object),
        m: dagCborDecode(new Uint8Array(r.metadata)),
      };
      const message = MessageSchema.parse(messageRaw);
      const messageWithLabel: z.infer<typeof LabeledMessageSchema> = {
        id: r.seq.toString(),
        m: message,
        l: r.label ?? 0,
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
  userId: number,
) {
  const info = await getInboxInfo(context, inboxId);
  if (!info || !(info.userId === userId || info.userId === 0)) {
    throw new HTTPException(403, {
      message: "Cannot label a message in someone else's inbox",
    });
  }
  const inboxSeq = info.inboxSeq;

  // Make sure the message is in the indbox
  const result = await context.env.DB.prepare(
    `SELECT seq FROM inbox_messages WHERE seq = ? AND inbox_seq = ?`,
  )
    .bind(Number(messageId), inboxSeq)
    .first();
  if (!result) {
    throw new HTTPException(404, {
      message: "Message not found",
    });
  }

  await context.env.DB.prepare(
    `
    INSERT INTO inbox_message_labels (
      message_seq,
      user_id,
      label
    ) VALUES (?, ?, ?)
    ON CONFLICT (message_seq, user_id) DO UPDATE SET label = EXCLUDED.label;
  `,
  )
    .bind(Number(messageId), userId, label)
    .run();
}

export async function exportMessages(
  context: Context<{ Bindings: Bindings }>,
  inboxId: string,
  userId: number,
  sinceSeq: number = 0,
) {
  const info = await getInboxInfo(context, inboxId);
  if (info?.inboxSeq === 0) {
    throw new HTTPException(403, {
      message: "Cannot export from the shared inbox",
    });
  }
  if (!info || info.userId !== userId) {
    throw new HTTPException(403, {
      message: "Cannot export from someone else's inbox",
    });
  }
  const inboxSeq = info.inboxSeq;

  const res = await context.env.DB.prepare(
    `
    SELECT
      seq,
      tags,
      object,
      metadata,
      l.label AS label
    FROM inbox_messages
    LEFT JOIN inbox_message_labels l
      ON seq = l.message_seq AND l.user_id = ?
    WHERE inbox_seq = ? AND seq > ?
    ORDER BY seq ASC
    LIMIT ?
  `,
  )
    .bind(userId, inboxSeq, sinceSeq, INBOX_QUERY_LIMIT + 1)
    .all<{
      seq: number;
      tags: ArrayBuffer;
      object: string;
      metadata: ArrayBuffer;
      label: number | null;
    }>();

  const hasMore = res.results.length === INBOX_QUERY_LIMIT + 1;
  const resultsRaw = res.results.slice(0, INBOX_QUERY_LIMIT);

  const lastSeq = resultsRaw.reduce((maxSeq, r) => Math.max(maxSeq, r.seq), 0);

  const results = resultsRaw.map((r) => {
    const messageRaw = {
      t: dagCborDecode(new Uint8Array(r.tags)),
      o: JSON.parse(r.object),
      m: dagCborDecode(new Uint8Array(r.metadata)),
    };
    const message = MessageSchema.parse(messageRaw);
    const messageWithLabel: z.infer<typeof LabeledMessageSchema> = {
      id: r.seq.toString(),
      m: message,
      l: r.label ?? 0,
    };
    return messageWithLabel;
  });

  return {
    results,
    lastSeq,
    hasMore,
  };
}
