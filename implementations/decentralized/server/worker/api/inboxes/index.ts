import type { Bindings } from "../../env";
import { HTTPException } from "hono/http-exception";
import { verifySessionHeader } from "../../app/auth/session";
import { sendMessage, labelMessage, queryMessages, exportMessages } from "./db";
import { Validator } from "@cfworker/json-schema";
import { z, createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { addAuthRoute, Base64IdSchema, disableCors } from "../shared";

const inboxIdSchema = z.union([Base64IdSchema, z.literal("public")]);

const TagsSchema = z
  .array(z.string())
  .refine((tags) => new Set(tags).size === tags.length, {
    message: "All tags must be unique, no duplicate values allowed",
  })
  .openapi({
    description:
      "A set of unique per-message tags. A message can only be queried by specifying one of its tags",
  });

const DataSchemaSchema = z.record(z.string(), z.any()).openapi({
  description: "A JSON Schema to filter the message data by.",
});

const MessageSchema = z.object({
  tags: TagsSchema,
  data: DataSchemaSchema,
});

const LabelSchema = z.int().min(0).openapi({
  description:
    "An integer label for the message indicating whether it is worth keeping",
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

const inboxes = new OpenAPIHono<{ Bindings: Bindings }>();

disableCors(inboxes);
addAuthRoute(inboxes, "Inboxes", "inboxId");

const sendRoute = createRoute({
  method: "put",
  description: "Sends a message to a particular inbox",
  tags: ["Inboxes"],
  path: "/{inboxId}/send",
  request: {
    params: z.object({
      inboxId: inboxIdSchema,
    }),
    body: {
      content: {
        "application/json": {
          schema: MessageSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Message already sent",
      content: {
        "application/json": {
          schema: z.object({
            messageId: z.string(),
          }),
        },
      },
    },
    201: {
      description: "Message sent successfully",
      content: {
        "application/json": {
          schema: z.object({
            messageId: z.string(),
          }),
        },
      },
    },
    404: { description: "Inbox not found" },
  },
});
inboxes.openapi(sendRoute, async (c) => {
  const { inboxId } = c.req.valid("param");
  const announcement = c.req.valid("json");
  const { messageId, created } = await sendMessage(c, inboxId, announcement);

  return c.json({ messageId }, created ? 201 : 200);
});

const labelRoute = createRoute({
  method: "put",
  description:
    "Label an message in an inbox as 'ok', 'expired', 'incorrect', 'junk', etc.",
  tags: ["Inboxes"],
  path: "/{inboxId}/label/{messageId}",
  request: {
    params: z.object({
      inboxId: inboxIdSchema,
      messageId: z.string(),
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
      description: "Message labeled successfully",
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
      description: "Cannot label an message in someone else's inbox",
    },
    404: { description: "Message not found" },
  },
});

inboxes.openapi(labelRoute, async (c) => {
  const { userId } = await verifySessionHeader(c);
  const { inboxId, messageId } = c.req.valid("param");
  const { label } = c.req.valid("json");
  await labelMessage(c, inboxId, messageId, label, userId);
  return c.json({ labeled: true });
});

const queryRoute = createRoute({
  method: "get",
  path: "/{inboxId}/query",
  tags: ["Inboxes"],
  description: "Query messages that have been sent to an inbox",
  request: {
    params: z.object({
      inboxId: inboxIdSchema,
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
      description: "Messages queried successfully",
      content: {
        "application/json": {
          schema: z.object({
            results: z.array(
              z.object({
                messageId: z.string(),
                message: MessageSchema,
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
      description: "Cannot query messages in someone else's inbox",
    },
  },
});
inboxes.openapi(queryRoute, async (c) => {
  let userId: string | undefined = undefined;
  try {
    const verification = await verifySessionHeader(c);
    userId = verification.userId;
  } catch {} // Not to worry if not logged in

  const { inboxId } = c.req.valid("param");

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

  const { results, hasMore, lastSeq } = await queryMessages(
    c,
    inboxId,
    tags,
    userId,
    sinceSeq,
  );

  const validResults = results.filter(
    (r) => validator.validate(r.message.data).valid,
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

const exportRoute = createRoute({
  method: "get",
  path: "/{inboxId}",
  tags: ["Inboxes"],
  description: "Export all messages sent to an inbox",
  request: {
    params: z.object({
      inboxId: inboxIdSchema,
    }),
    query: z.object({
      cursor: z.string().optional(),
    }),
  },
  security: [{ oauth2: [] }],
  responses: {
    200: {
      description: "Exported messages successfully",
      content: {
        "application/json": {
          schema: z.object({
            results: z.array(
              z.object({
                messageId: z.string(),
                message: MessageSchema,
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
      description: "Cannot export from someone else's inbox",
    },
  },
});

// Export messages
inboxes.openapi(exportRoute, async (c) => {
  const { userId } = await verifySessionHeader(c);
  const { inboxId } = c.req.valid("param");
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

  const { results, lastSeq, hasMore } = await exportMessages(
    c,
    inboxId,
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

export default inboxes;
