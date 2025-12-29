import type { Context } from "hono";
import type { Bindings } from "../env";
import { encode as dagCborEncode } from "@ipld/dag-cbor";
import { HTTPException } from "hono/http-exception";

async function isIndexerController(
  context: Context<{ Bindings: Bindings }>,
  indexerId: string,
  userId: string | undefined,
): Promise<boolean> {
  if (!userId) return false;
  if (indexerId === "public") return true;

  const result = await context.env.DB.prepare(
    "SELECT indexer_id FROM indexers WHERE indexer_id = ? AND user_id = ?",
  )
    .bind(indexerId, userId)
    .first();

  return !!result;
}

export async function announce(
  context: Context<{ Bindings: Bindings }>,
  indexerId: string,
  announcement: {
    tombstone: boolean;
    tags: string[];
    data: unknown;
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
  const isController = await isIndexerController(context, indexerId, userId);

  const inserted = await context.env.DB.prepare(
    `
      INSERT INTO announcements (
        hash,
        indexer_id,
        tombstone,
        data,
        tags
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(hash) DO NOTHING
      RETURNING seq;
    `,
  )
    .bind(
      announcementHash,
      indexerId,
      announcement.tombstone ? 1 : 0,
      JSON.stringify(announcement.data),
      JSON.stringify(announcement.tags),
    )
    .first<{ seq: number }>();

  if (!inserted) {
    throw new Error("Duplicate announcement");
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

  return announcementSeq;
}

export async function query(
  context: Context<{ Bindings: Bindings }>,
  indexerId: string,
  tags: string[],
  ifCreatedSinceSeq?: number,
  userId?: string,
) {
  const isController = await isIndexerController(context, indexerId, userId);
  if (!isController) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const sql = [
    `
    WITH matched AS (
      SELECT DISTINCT at.announcement_seq
      FROM announcement_tags at
      WHERE at.indexer_id = ? AND at.tag IN (${tags.map(() => "?").join(", ")})
        AND at.announcement_seq > ?
    )
    SELECT
      a.seq,
      a.tombstone,
      a.data,
      a.tags,
      al.label AS label
    FROM matched m
    JOIN announcements a
      ON a.seq = m.announcement_seq
    LEFT JOIN announcement_labels al
      ON a.seq = al.announcement_seq
     AND al.user_id = ?
    `,
    // Only return if the data is "OK" (label = 1) or no label yet
    userId ? ` AND (al.label = 1 OR al.label IS NULL)` : ``,
  ].join("\n");

  const bindings = [indexerId, ...tags, ifCreatedSinceSeq ?? 0, userId];

  const res = await context.env.DB.prepare(sql)
    .bind(...bindings)
    .all<{
      seq: number;
      tombstone: number;
      data: string;
      tags: string;
      label: number | null;
    }>();

  const results = res.results.map((r) => ({
    announcementId: r.seq.toString(),
    announcement: {
      tombstone: r.tombstone !== 0,
      tags: JSON.parse(r.tags) as string[],
      data: JSON.parse(r.data) as unknown,
    },
    label: r.label ?? 0,
  }));

  const querySeq = res.results.reduce(
    (maxSeq, r) => Math.max(maxSeq, r.seq),
    0,
  );

  return {
    results,
    querySeq,
  };
}

export async function labelAnnouncement(
  context: Context<{ Bindings: Bindings }>,
  indexerId: string,
  announcementId: string,
  label: number,
  userId: string,
) {
  const isController = await isIndexerController(context, indexerId, userId);
  if (!isController) {
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

export async function exportAll(
  context: Context<{ Bindings: Bindings }>,
  indexerId: string,
  userId: string,
) {
  if (indexerId === "public") {
    throw new HTTPException(403, {
      message: "Cannot export from the public indexer",
    });
  }
  const isController = await isIndexerController(context, indexerId, userId);
  if (!isController) {
    throw new HTTPException(403, {
      message: "Cannot export from someone else's indexer",
    });
  }

  const results = await context.env.DB.prepare(
    `
    SELECT
      tombstone,
      data,
      tags,
    FROM announcements
    WHERE indexer_id = ?
  `,
  )
    .bind(userId, indexerId)
    .all<{
      tombstone: number;
      data: string;
      tags: string;
    }>();

  return results.results.map((r) => ({
    tombstone: r.tombstone !== 0,
    tags: JSON.parse(r.tags) as string[],
    data: JSON.parse(r.data),
  }));
}
