import type { Context } from "hono";
import type { Bindings } from "../../env";
import { encode as dagCborEncode } from "@ipld/dag-cbor";
import { HTTPException } from "hono/http-exception";

const QUERY_LIMIT = 100;

async function getIndexerController(
  context: Context<{ Bindings: Bindings }>,
  indexerId: string,
): Promise<string | undefined> {
  if (indexerId === "public") return "public";

  const result = await context.env.DB.prepare(
    "SELECT user_id FROM indexers WHERE indexer_id = ?",
  )
    .bind(indexerId)
    .first<{ user_id: string }>();

  return result?.user_id;
}

export async function announce(
  context: Context<{ Bindings: Bindings }>,
  indexerId: string,
  announcement: {
    tags: string[];
    data: {};
  },
  userId: string | undefined,
) {
  // Hash the announcement to prevent inserting duplicates
  const operationBytes = dagCborEncode({ indexerId, ...announcement });
  const announcementHash = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(operationBytes),
  );

  // Determine if the indexer is under the user's control,
  // which we will later use to determine if we can label the announcement
  const controller = await getIndexerController(context, indexerId);
  if (!controller) {
    throw new HTTPException(404, { message: "Indexer not found" });
  }
  const isController = controller === userId;

  const inserted = await context.env.DB.prepare(
    `
      INSERT INTO announcements (
        hash,
        indexer_id,
        data,
        tags
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(hash) DO NOTHING
      RETURNING seq;
    `,
  )
    .bind(
      announcementHash,
      indexerId,
      JSON.stringify(announcement.data),
      JSON.stringify(announcement.tags),
    )
    .first<{ seq: number }>();

  if (!inserted) {
    throw new HTTPException(409, { message: "Duplicate announcement" });
  }

  const statements: D1PreparedStatement[] = [];

  const announcementSeq = inserted.seq;

  for (const tag of announcement.tags) {
    statements.push(
      context.env.DB.prepare(
        `
        INSERT INTO announcement_tags (
          announcement_seq,
          indexer_id,
          tag
        ) VALUES (?, ?, ?);
      `,
      ).bind(announcementSeq, indexerId, tag),
    );
  }

  if (isController) {
    statements.push(
      context.env.DB.prepare(
        `
        INSERT INTO announcement_labels (
          announcement_seq,
          user_id,
          label
        ) VALUES (?, ?, 1);
      `,
      ).bind(announcementSeq, userId),
    );
  }

  await context.env.DB.batch(statements);

  return announcementSeq.toString();
}

export async function queryAnnouncements(
  context: Context<{ Bindings: Bindings }>,
  indexerId: string,
  tags: string[],
  userId?: string,
  sinceSeq: number = 0,
) {
  const controller = await getIndexerController(context, indexerId);
  if (controller !== "public" && controller !== userId) {
    throw new HTTPException(403, {
      message: "Cannot query someone else's indexer",
    });
  }

  const sql = [
    `WITH matched AS (
      SELECT DISTINCT at.announcement_seq
      FROM announcement_tags at
      WHERE at.indexer_id = ? AND at.tag IN (${tags.map(() => "?").join(", ")})
        AND at.announcement_seq > ?
    )
    SELECT
      a.seq,
      a.data,
      a.tags,`,
    userId ? `al.label AS label` : `NULL as label`,
    `FROM matched m
    JOIN announcements a
      ON a.seq = m.announcement_seq`,
    // Only return if the data is "OK" (label = 1) or no label yet
    userId
      ? `LEFT JOIN announcement_labels al
      ON m.announcement_seq = al.announcement_seq AND al.user_id = ?
    WHERE al.label = 1 OR al.label IS NULL`
      : ``,
    `ORDER BY a.seq ASC
    LIMIT ?`,
  ].join("\n");

  const bindings = [
    indexerId,
    ...tags,
    sinceSeq,
    ...(userId ? [userId] : []),
    QUERY_LIMIT + 1,
  ];

  const res = await context.env.DB.prepare(sql)
    .bind(...bindings)
    .all<{
      seq: number;
      data: string;
      tags: string;
      label: number | null;
    }>();

  const hasMore = res.results.length === QUERY_LIMIT + 1;
  const resultsRaw = res.results.slice(0, QUERY_LIMIT);

  const results = resultsRaw.map((r) => ({
    announcementId: r.seq.toString(),
    announcement: {
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

export async function labelAnnouncement(
  context: Context<{ Bindings: Bindings }>,
  indexerId: string,
  announcementId: string,
  label: number,
  userId: string,
) {
  const controller = await getIndexerController(context, indexerId);
  if (controller !== "public" && controller !== userId) {
    throw new HTTPException(403, {
      message: "Cannot label an announcement in someone else's indexer",
    });
  }

  // Make sure the announcement is in the indexer
  const result = await context.env.DB.prepare(
    `SELECT seq FROM announcements WHERE seq = ? AND indexer_id = ?`,
  )
    .bind(Number(announcementId), indexerId)
    .first();
  if (!result) {
    throw new HTTPException(404, {
      message: "Announcement not found",
    });
  }

  await context.env.DB.prepare(
    `
    INSERT INTO announcement_labels (
      announcement_seq,
      user_id,
      label
    ) VALUES (?, ?, ?)
    ON CONFLICT (announcement_seq, user_id) DO UPDATE SET label = EXCLUDED.label;
  `,
  )
    .bind(Number(announcementId), userId, label)
    .run();
}

export async function exportAnnouncements(
  context: Context<{ Bindings: Bindings }>,
  indexerId: string,
  userId: string,
  sinceSeq: number = 0,
) {
  const controller = await getIndexerController(context, indexerId);
  if (controller === "public") {
    throw new HTTPException(403, {
      message: "Cannot export from the public indexer",
    });
  } else if (controller !== userId) {
    throw new HTTPException(403, {
      message: "Cannot export from someone else's indexer",
    });
  }

  const res = await context.env.DB.prepare(
    `
    SELECT
      seq,
      data,
      tags
    FROM announcements
    WHERE indexer_id = ? AND seq > ?
    ORDER BY seq ASC
    LIMIT ?
  `,
  )
    .bind(indexerId, sinceSeq, QUERY_LIMIT + 1)
    .all<{
      seq: number;
      data: string;
      tags: string;
    }>();

  const hasMore = res.results.length === QUERY_LIMIT + 1;
  const resultsRaw = res.results.slice(0, QUERY_LIMIT);

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
