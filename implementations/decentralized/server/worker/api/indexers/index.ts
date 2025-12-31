import type { Bindings } from "../../env";
import { HTTPException } from "hono/http-exception";
import { verifySessionHeader } from "../../app/auth/session";
import {
  announce,
  labelAnnouncement,
  queryAnnouncements,
  exportAnnouncements,
} from "./db";
import { Validator } from "@cfworker/json-schema";
import { z, createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { addAuthRoute, Base64IdSchema, disableCors } from "../shared";

const IndexerIdSchema = z.union([Base64IdSchema, z.literal("public")]);

const TagsSchema = z
  .array(z.string())
  .refine((tags) => new Set(tags).size === tags.length, {
    message: "All tags must be unique, no duplicate values allowed",
  });

const DataSchemaSchema = z.record(z.string(), z.any());

const AnnouncementSchema = z.object({
  tags: TagsSchema,
  data: DataSchemaSchema,
});

const LabelSchema = z.int().min(0).openapi({
  description:
    "An integer label for the announcement, 0 for undefined, 1 for ok, 2 for expired, 3 for incorrect, 4 for junk",
  example: 1,
});

const SinceSeqSchema = z.int().min(0);

const QueryCursorSchema = z.object({
  sinceSeq: SinceSeqSchema,
  tags: TagsSchema,
  dataSchema: DataSchemaSchema,
});

const ExportCursorSchema = z.object({
  sinceSeq: SinceSeqSchema,
});

const indexers = new OpenAPIHono<{ Bindings: Bindings }>();

disableCors(indexers);
addAuthRoute(indexers, "Indexers", "indexerId");

const announceRoute = createRoute({
  method: "post",
  description: "Announce ",
  tags: ["Indexers"],
  path: "/{indexerId}/announce",
  request: {
    params: z.object({
      indexerId: IndexerIdSchema,
    }),
    body: {
      content: {
        "application/json": {
          schema: AnnouncementSchema,
        },
      },
      required: true,
    },
  },
  security: [{ oauth2: [] }],
  responses: {
    200: {
      description: "Announcement created successfully",
      content: {
        "application/json": {
          schema: z.object({
            announcementId: z.string(),
          }),
        },
      },
    },
    401: { description: "Invalid authorization" },
    404: { description: "Indexer not found" },
    409: { description: "Duplicate announcement" },
  },
});
indexers.openapi(announceRoute, async (c) => {
  let userId: string | undefined = undefined;
  try {
    const verification = await verifySessionHeader(c);
    userId = verification.userId;
  } catch {} // Not to worry if not logged in

  const { indexerId } = c.req.valid("param");
  const announcement = c.req.valid("json");
  const announcementId = await announce(c, indexerId, announcement, userId);

  return c.json({ announcementId });
});

const labelAnnouncementRoute = createRoute({
  method: "put",
  description:
    "Label an announcement as 'ok', 'expired', 'incorrect' or 'junk'",
  tags: ["Indexers"],
  path: "/{indexerId}/label/{announcementId}",
  request: {
    params: z.object({
      indexerId: IndexerIdSchema,
      announcementId: z.string(),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            label: LabelSchema.min(1),
          }),
        },
      },
      required: true,
    },
  },
  security: [{ oauth2: [] }],
  responses: {
    200: {
      description: "Announcement labeled successfully",
      content: {
        "application/json": {
          schema: z.object({
            labeled: z.literal(true),
          }),
        },
      },
    },
    401: { description: "Invalid authorization" },
    403: {
      description: "Cannot label an announcement in someone else's indexer",
    },
    404: { description: "Announcement not found" },
  },
});

indexers.openapi(labelAnnouncementRoute, async (c) => {
  const { userId } = await verifySessionHeader(c);
  const { indexerId, announcementId } = c.req.valid("param");
  const { label } = c.req.valid("json");
  await labelAnnouncement(c, indexerId, announcementId, label, userId);
  return c.json({ labeled: true });
});

const queryAnnouncementsRoute = createRoute({
  method: "get",
  path: "/{indexerId}/query",
  tags: ["Indexers"],
  description: "Query data that has been announced to the indexer",
  request: {
    params: z.object({
      indexerId: IndexerIdSchema,
    }),
    query: z.object({
      cursor: z.string().optional(),
      tag: z.preprocess((v) => {
        if (!v) return v;
        return Array.isArray(v) ? v : [v];
      }, TagsSchema.optional()),
      dataSchema: z.string().optional(),
    }),
  },
  security: [{ oauth2: [] }],
  responses: {
    200: {
      description: "Announcements queried successfully",
      content: {
        "application/json": {
          schema: z.object({
            results: z.array(
              z.object({
                announcementId: z.string(),
                announcement: AnnouncementSchema,
                label: LabelSchema,
              }),
            ),
            hasMore: z.boolean(),
            cursor: z.string(),
          }),
        },
      },
    },
    401: { description: "Invalid authorization" },
    403: {
      description: "Cannot query announcements in someone else's indexer",
    },
  },
});

indexers.openapi(queryAnnouncementsRoute, async (c) => {
  let userId: string | undefined = undefined;
  try {
    const verification = await verifySessionHeader(c);
    userId = verification.userId;
  } catch {} // Not to worry if not logged in

  const { indexerId } = c.req.valid("param");

  let {
    cursor,
    tag: tags,
    dataSchema: dataSchemaString,
  } = c.req.valid("query");

  let dataSchema: {};
  let sinceSeq: number | undefined = undefined;
  if (cursor) {
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
  } else if (tags && dataSchemaString) {
    let dataSchemaJSON: unknown;
    try {
      dataSchemaJSON = JSON.parse(dataSchemaString);
    } catch {
      throw new HTTPException(400, { message: "Invalid dataSchema" });
    }
    const dataSchemaParsed = DataSchemaSchema.safeParse(dataSchemaJSON);
    if (!dataSchemaParsed.success) {
      throw new HTTPException(400, { message: "Invalid dataSchema" });
    }
    dataSchema = dataSchemaParsed.data;
  } else {
    throw new HTTPException(400, {
      message: "Must have cursor or both tags and dataSchema",
    });
  }

  let validator: Validator;
  try {
    validator = new Validator(dataSchema, "2020-12");
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

  const validResults = results.filter(
    (r) => validator.validate(r.announcement.data).valid,
  );

  // Construct a cursor
  const resultCursorJSON: z.infer<typeof QueryCursorSchema> = {
    tags,
    dataSchema,
    sinceSeq: lastSeq,
  };
  const resultCursor = JSON.stringify(resultCursorJSON);

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
      cursor: resultCursor,
    },
    { headers },
  );
});

const exportAnnouncementsRoute = createRoute({
  method: "get",
  path: "/{indexerId}",
  tags: ["Indexers"],
  description: "Export all data announced to an indexer",
  request: {
    params: z.object({
      indexerId: IndexerIdSchema,
    }),
    query: z.object({
      cursor: z.string().optional(),
    }),
  },
  security: [{ oauth2: [] }],
  responses: {
    200: {
      description: "Exported successfully",
      content: {
        "application/json": {
          schema: z.object({
            results: z.array(
              z.object({
                announcementId: z.string(),
                announcement: AnnouncementSchema,
                label: LabelSchema,
              }),
            ),
            hasMore: z.boolean(),
            cursor: z.string(),
          }),
        },
      },
    },
    401: { description: "Invalid authorization" },
    403: {
      description: "Cannot export from someone else's indexer",
    },
  },
});

// Export announcements
indexers.openapi(exportAnnouncementsRoute, async (c) => {
  const { userId } = await verifySessionHeader(c);
  const { indexerId } = c.req.valid("param");
  const { cursor: cursorParam } = c.req.valid("query");

  let sinceSeq: number | undefined = undefined;
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
