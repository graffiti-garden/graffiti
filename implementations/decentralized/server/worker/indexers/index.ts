import { Hono } from "hono";
import type { Bindings } from "../env";
import { HTTPException } from "hono/http-exception";
import { verifySessionHeader } from "../app/auth/session";
import {
  announce,
  labelAnnouncement,
  queryAnnouncements,
  exportAnnouncements,
} from "./db";
import { z } from "zod";
import Ajv, { type ValidateFunction } from "ajv";

const ajv = new Ajv({ strict: false });
const indexers = new Hono<{ Bindings: Bindings }>();

indexers.use("*", async (c, next) => {
  // Disable CORs
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  await next();
});

indexers.get("/auth", async (c) => {
  const headers = new Headers();
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return c.text(`gf:a:oauth:${c.env.BASE_HOST}/oauth`, { headers });
});

const TagsSchema = z
  .array(z.string())
  .refine((tags) => new Set(tags).size === tags.length, {
    message: "All tags must be unique, no duplicate values allowed",
  });

const AnnouncementSchema = z.object({
  tombstone: z.boolean(),
  tags: TagsSchema,
  data: z.record(z.string(), z.any()),
});

indexers.post("/:indexer-id/announce", async (c) => {
  let userId: string | undefined = undefined;
  try {
    const verification = await verifySessionHeader(c);
    userId = verification.userId;
  } catch {} // Not to worry if not logged in

  const indexerId = c.req.param("indexer-id");

  const body = await c.req.json();
  const parsed = AnnouncementSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: `Invalid announcement: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
    });
  }
  const announcement = parsed.data;

  const announcementId = await announce(c, indexerId, announcement, userId);

  return c.json({ announcementId });
});

const LabelSchema = z.object({
  announcementId: z.string(),
  label: z.int().min(0),
});
indexers.post("/:indexer-id/label", async (c) => {
  const { userId } = await verifySessionHeader(c);
  const indexerId = c.req.param("indexer-id");

  const body = await c.req.json();
  const parsed = LabelSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: `Invalid label: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
    });
  }
  const { announcementId, label } = parsed.data;

  await labelAnnouncement(c, indexerId, announcementId, label, userId);

  return c.json({ labeled: true });
});

const QueryParamsSchema = z.union([
  z.object({
    cursor: z.string(),
  }),
  z.object({
    tags: TagsSchema,
    dataSchema: z.object({}),
  }),
]);

const QueryCursorSchema = z.object({
  sinceSeq: z.int().min(0),
  tags: TagsSchema,
  dataSchema: z.object({}),
});

indexers.get("/:indexer-id/query", async (c) => {
  let userId: string | undefined = undefined;
  try {
    const verification = await verifySessionHeader(c);
    userId = verification.userId;
  } catch {} // Not to worry if not logged in

  const indexerId = c.req.param("indexer-id");

  const paramsRaw = c.req.query();
  const paramsParsed = QueryParamsSchema.safeParse(paramsRaw);
  if (!paramsParsed.success) {
    throw new HTTPException(400, {
      message: `Invalid parameters: ${paramsParsed.error.issues.map((i) => i.message).join(", ")}`,
    });
  }
  const params = paramsParsed.data;

  let tags: string[];
  let dataSchema: {};
  let sinceSeq: number | undefined = undefined;
  if ("cursor" in params) {
    const cursor = params.cursor;
    let cursorJSON: unknown;
    try {
      cursorJSON = JSON.parse(cursor);
    } catch {
      throw new HTTPException(400, { message: "Invalid cursor" });
    }
    const cursorParsed = QueryCursorSchema.safeParse(cursorJSON);
    if (!cursorParsed.success) {
      throw new HTTPException(400, { message: "Invalid cursor" });
    }
    tags = cursorParsed.data.tags;
    dataSchema = cursorParsed.data.dataSchema;
    sinceSeq = cursorParsed.data.sinceSeq;
  } else {
    tags = params.tags;
    dataSchema = params.dataSchema;
  }

  let validate: ValidateFunction;
  try {
    validate = ajv.compile(dataSchema);
  } catch (error) {
    throw new HTTPException(400, {
      message: `Error compiling schema: ${error instanceof Error ? error.message : "unknown"}`,
    });
  }

  const { results, hasMore, lastSeq } = await queryAnnouncements(
    c,
    indexerId,
    tags,
    userId,
    sinceSeq,
  );

  const validResults = results.filter((r) => validate(r.announcement.data));

  // Construct a cursor
  const cursorJSON: z.infer<typeof QueryCursorSchema> = {
    tags,
    dataSchema,
    sinceSeq: lastSeq,
  };
  const cursor = JSON.stringify(cursorJSON);

  const headers = new Headers();
  headers.set("Vary", "Authorization");
  if (hasMore) {
    // If there are more announcements to return,
    // the only thing that may happen to the results in *this*
    // return, is that some of the announcements may be deleted,
    // and their deletions may expire. Therefore, the cache can
    // stay fresh as long as the expiration time, which is currently
    // unlimited until a CRON job is set up to periodically remove
    // expired announcements.
    headers.set("Cache-Control", "private, max-age=604800");
  } else {
    // If this is not a "full" result, then fetching
    // again will possibly return more results.
    // However, the results may be used in a pinch as long
    // as the expiration window above.
    headers.set("Cache-Control", "private, max-age=0, stale-if-error=604800");
  }

  return c.json(
    {
      results: validResults,
      hasMore,
      cursor,
    },
    { headers },
  );
});

const ExportCursorSchema = z.object({
  sinceSeq: z.int().min(0),
});

// Export announcements
indexers.get("/:indexer-id", async (c) => {
  const { userId } = await verifySessionHeader(c);
  const indexerId = c.req.param("indexer-id");

  let sinceSeq: number | undefined = undefined;
  const cursorParam = c.req.query("cursor");
  if (cursorParam) {
    let cursorJSON: unknown;
    try {
      cursorJSON = JSON.parse(cursorParam);
    } catch (error) {
      throw new HTTPException(400, { message: "Invalid cursor." });
    }

    const cursorParsed = ExportCursorSchema.safeParse(cursorJSON);
    if (!cursorParsed.success) {
      throw new HTTPException(400, { message: "Invalid cursor." });
    }
    sinceSeq = cursorParsed.data.sinceSeq;
  }

  const { results, lastSeq, hasMore } = await exportAnnouncements(
    c,
    indexerId,
    userId,
    sinceSeq,
  );

  const cursorJSON: z.infer<typeof ExportCursorSchema> = {
    sinceSeq: lastSeq,
  };
  const cursor = JSON.stringify(cursorJSON);

  // See above
  const headers = new Headers();
  headers.set("Vary", "Authorization");
  if (hasMore) {
    headers.set("Cache-Control", "private, max-age=604800");
  } else {
    headers.set("Cache-Control", "private, max-age=0, stale-if-error=604800");
  }

  return c.json({ results, hasMore, cursor }, { headers });
});

export default indexers;
