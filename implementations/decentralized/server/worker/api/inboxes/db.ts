import type { Context } from "hono";
import type { Bindings } from "../../env";
import { encode as dagCborEncode } from "@ipld/dag-cbor";
import { HTTPException } from "hono/http-exception";

const INBOX_QUERY_LIMIT = 100;

async function getInboxController(
  context: Context<{ Bindings: Bindings }>,
  inboxId: string,
): Promise<string | undefined> {
  if (inboxId === "public") return "public";

  const result = await context.env.DB.prepare(
    "SELECT user_id FROM inboxes WHERE inbox_id = ?",
  )
    .bind(inboxId)
    .first<{ user_id: string }>();

  return result?.user_id;
}

export async function sendMessage(
  context: Context<{ Bindings: Bindings }>,
  inboxId: string,
  message: {
    tags: string[];
    data: {};
  },
) {
  // Hash the message to prevent inserting duplicates
  const operationBytes = dagCborEncode({ inboxId, ...message });
  const messageHash = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(operationBytes),
  );

  // Determine if the inbox is under the user's control,
  // which we will later use to determine if we can label the message
  const controller = await getInboxController(context, inboxId);
  if (!controller) {
    throw new HTTPException(404, { message: "Inbox not found" });
  }

  const inserted = await context.env.DB.prepare(
    `
      INSERT INTO inbox_messages (
        hash,
        inbox_id,
        data,
        tags
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(hash) DO NOTHING
      RETURNING seq;
    `,
  )
    .bind(
      messageHash,
      inboxId,
      JSON.stringify(message.data),
      JSON.stringify(message.tags),
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
      `SELECT seq FROM inbox_messages WHERE inbox_id = ? AND hash = ?`,
    )
      .bind(inboxId, messageHash)
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
    for (const tag of message.tags) {
      statements.push(
        context.env.DB.prepare(
          `
          INSERT INTO inbox_message_tags (
            message_seq,
            inbox_id,
            tag
          ) VALUES (?, ?, ?);
        `,
        ).bind(messageSeq, inboxId, tag),
      );
    }
    await context.env.DB.batch(statements);
  }

  return { messageId: messageSeq.toString(), created };
}

export async function queryMessages(
  context: Context<{ Bindings: Bindings }>,
  inboxId: string,
  tags: string[],
  userId?: string,
  sinceSeq: number = 0,
) {
  const controller = await getInboxController(context, inboxId);
  if (controller !== "public" && controller !== userId) {
    throw new HTTPException(403, {
      message: "Cannot query someone else's inbox",
    });
  }

  const sql = [
    `WITH message_candidates AS (
      SELECT DISTINCT t.message_seq
      FROM inbox_message_tags t
      WHERE t.inbox_id = ? AND t.tag IN (${tags.map(() => "?").join(", ")})
        AND t.message_seq > ?
      ORDER BY t.message_seq ASC
    )
    SELECT
      m.seq,
      m.data,
      m.tags,`,
    userId ? `l.label AS label` : `NULL as label`,
    `FROM message_candidates c
    JOIN inbox_messages m
      ON m.seq = c.message_seq`,
    // Only return if the data is "OK" (label = 1) or no label yet
    userId
      ? `LEFT JOIN inbox_message_labels l
      ON c.message_seq = l.message_seq AND l.user_id = ?
    WHERE l.label = 1 OR l.label IS NULL`
      : ``,
    `ORDER BY m.seq ASC
    LIMIT ?`,
  ].join("\n");

  const bindings = [
    inboxId,
    ...tags,
    sinceSeq,
    ...(userId ? [userId] : []),
    INBOX_QUERY_LIMIT + 1,
  ];

  const res = await context.env.DB.prepare(sql)
    .bind(...bindings)
    .all<{
      seq: number;
      data: string;
      tags: string;
      label: number | null;
    }>();

  const hasMore = res.results.length === INBOX_QUERY_LIMIT + 1;
  const resultsRaw = res.results.slice(0, INBOX_QUERY_LIMIT);

  const results = resultsRaw.map((r) => ({
    messageId: r.seq.toString(),
    message: {
      tags: JSON.parse(r.tags) as string[],
      data: JSON.parse(r.data) as unknown,
    },
    label: r.label ?? 0,
  }));

  const lastSeq = resultsRaw.reduce((maxSeq, r) => Math.max(maxSeq, r.seq), 0);

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
  userId: string,
) {
  const controller = await getInboxController(context, inboxId);
  if (controller !== "public" && controller !== userId) {
    throw new HTTPException(403, {
      message: "Cannot label a message in someone else's inbox",
    });
  }

  // Make sure the message is in the indbox
  const result = await context.env.DB.prepare(
    `SELECT seq FROM inbox_messages WHERE seq = ? AND inbox_id = ?`,
  )
    .bind(Number(messageId), inboxId)
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
  userId: string,
  sinceSeq: number = 0,
) {
  const controller = await getInboxController(context, inboxId);
  if (controller === "public") {
    throw new HTTPException(403, {
      message: "Cannot export from the public inbox",
    });
  } else if (controller !== userId) {
    throw new HTTPException(403, {
      message: "Cannot export from someone else's inbox",
    });
  }

  const res = await context.env.DB.prepare(
    `
    SELECT
      seq,
      data,
      tags
    FROM inbox_messages
    WHERE inbox_id = ? AND seq > ?
    ORDER BY seq ASC
    LIMIT ?
  `,
  )
    .bind(inboxId, sinceSeq, INBOX_QUERY_LIMIT + 1)
    .all<{
      seq: number;
      data: string;
      tags: string;
    }>();

  const hasMore = res.results.length === INBOX_QUERY_LIMIT + 1;
  const resultsRaw = res.results.slice(0, INBOX_QUERY_LIMIT);

  const results = resultsRaw.map((r) => ({
    tags: JSON.parse(r.tags) as string[],
    data: JSON.parse(r.data),
  }));

  const lastSeq = resultsRaw.reduce((maxSeq, r) => Math.max(maxSeq, r.seq), 0);

  return {
    results,
    lastSeq,
    hasMore,
  };
}
