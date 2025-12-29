import type { Context } from "hono";
import { encodeBase64 } from "../app/auth/utils";
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

async function getClock(
  context: Context<{ Bindings: Bindings }>,
): Promise<number> {
  const result = await context.env.DB.prepare(
    "SELECT value FROM announcement_clock WHERE id = 1",
  ).first<{ value: number }>();

  return result?.value ?? 0;
}

async function deriveAnnounceId(announcement: unknown) {
  const operationBytes = dagCborEncode(announcement);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(operationBytes),
  );
  return encodeBase64(new Uint8Array(digest));
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
  // Derive a stable announcement ID
  const announcementId = await deriveAnnounceId({ indexerId, ...announcement });
  const clock = await getClock(context);

  const statements: string[] = [];
  const bindings: any[] = [];

  statements.push(`INSERT OR IGNORE INTO announcements (
      announcement_id,
      indexer_id,
      tombstone,
      data,
      tags
    ) VALUES (?, ?, ?, ?, ?);
  `);
  bindings.push(
    announcementId,
    indexerId,
    announcement.tombstone ? 1 : 0,
    JSON.stringify(announcement.data),
    JSON.stringify(announcement.tags),
  );

  for (const tag of announcement.tags) {
    statements.push(`
      INSERT OR IGNORE INTO announcement_tags (
        announcement_id,
        indexer_id,
        tag,
        created_at
      )
      SELECT ?, ?, ?, ?
      WHERE changes() = 1;
    `);
    bindings.push(announcementId, indexerId, tag, clock);
  }

  // If the indexer is the user's own
  // or the indexer is public, label it as "OK" (1)
  const isController = await isIndexerController(context, indexerId, userId);
  if (isController) {
    statements.push(`
      INSERT INTO announcement_labels (
        announcement_id,
        user_id,
        label
      ) VALUES (?, ?, 1)
      ON CONFLICT (announcement_id, user_id) DO UPDATE SET label = 1;
    `);
    bindings.push(announcementId, userId);
  }

  const sql = `
    BEGIN;
    ${statements.join("\n")}
    COMMIT;
  `;

  await context.env.DB.prepare(sql)
    .bind(...bindings)
    .run();

  return announcementId;
}

export async function query(
  context: Context<{ Bindings: Bindings }>,
  indexerId: string,
  tags: string[],
  ifCreatedSince?: number,
  userId?: string,
) {
  const isController = await isIndexerController(context, indexerId, userId);
  if (!isController) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const queryTime = await getClock(context);

  const sql = [
    `
    WITH matched AS (
      SELECT DISTINCT at.announcement_id
      FROM announcement_tags at
      WHERE at.indexer_id = ? AND at.tag IN (${tags.map(() => "?").join(", ")})
        AND at.created_at > ?
    )
    SELECT
      a.announcement_id,
      a.tombstone,
      a.data,
      a.tags,
      al.label AS label
    FROM matched m
    JOIN announcements a
      ON a.announcement_id = m.announcement_id
    LEFT JOIN announcement_labels al
      ON al.announcement_id = a.announcement_id
     AND al.user_id = ?
    `,
    // Only return if the data is "OK" (label = 1) or no label yet
    userId ? ` AND (al.label = 1 OR al.label IS NULL)` : ``,
  ].join("\n");

  const bindings = [indexerId, ...tags, ifCreatedSince ?? 0, userId];

  const res = await context.env.DB.prepare(sql)
    .bind(...bindings)
    .all<{
      announcement_id: string;
      tombstone: number;
      data: string;
      tags: string;
      label: number | null;
    }>();

  const results = res.results.map((r) => ({
    announcementId: r.announcement_id,
    announcement: {
      tombstone: r.tombstone !== 0,
      tags: JSON.parse(r.tags) as string[],
      data: JSON.parse(r.data) as unknown,
    },
    label: r.label ?? 0,
  }));

  return {
    results,
    queryTime,
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

  // Make sure the announcement_id is in the indexer_id
  const result = await context.env.DB.prepare(
    `SELECT announcement_id FROM announcements WHERE announcement_id = ? AND indexer_id = ?`,
  )
    .bind(announcementId, indexerId)
    .first();
  if (!result) {
    throw new HTTPException(404, {
      message: "Announcement not found",
    });
  }

  await context.env.DB.prepare(
    `
    INSERT INTO announcement_labels (
      announcement_id,
      user_id,
      label
    ) VALUES (?, ?, ?)
    ON CONFLICT (announcement_id, user_id) DO UPDATE SET label = EXCLUDED.label;
  `,
  )
    .bind(announcementId, userId, label)
    .run();
}

export async function export_(
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
      announcement_id,
      tombstone,
      data,
      tags,
      al.label AS label
    FROM announcements a
    LEFT JOIN announcement_labels al
      ON al.announcement_id = a.announcement_id
     AND al.user_id = ?
    WHERE indexer_id = ?
  `,
  )
    .bind(userId, indexerId)
    .all<{
      announcement_id: string;
      tombstone: number;
      data: string;
      tags: string;
      label: number | null;
    }>();

  return results.results.map((r) => ({
    announcementId: r.announcement_id,
    announcement: {
      tombstone: r.tombstone !== 0,
      tags: JSON.parse(r.tags) as string[],
      data: JSON.parse(r.data),
    },
    label: r.label ?? 0,
  }));
}
