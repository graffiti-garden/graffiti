import { Hono, type Context } from "hono";
import type { Bindings } from "../../env";
import { HTTPException } from "hono/http-exception";
import { getHeaderToken, verifySessionHeader } from "../../app/auth/session";
import {
  sendMessage,
  setMessagePins,
  queryMessages,
  exportMessages,
  MessageSchema,
  InboxMessageSchema,
} from "./db";
import { z, createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { augmentService, ExportBodySchema, getId } from "../shared";
import {
  encode as dagCborEncode,
  decode as dagCborDecode,
} from "@ipld/dag-cbor";
import { bodyLimit } from "hono/body-limit";
import { TagsSchema } from "./db";
import { encodeBase64, decodeBase64 } from "../../app/auth/utils";

const MESSAGE_RETENTION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_MESSAGE_SIZE_BYTES = 32 * 1024; // 32 KiB
const RATE_LIMIT_SECONDS = 1; // 1 second
// Inbox returns 10 results for a fast initial response,
// then 100, then pages of 500 after that. Based on testing
// this lets the "loop" start faster (inbox -> DID -> storage)
// while limiting the number of requests for large queries.
const QUERY_PAGE_LIMITS = [10, 100, 500] as const;

function getInboxId(context: Context<{ Bindings: Bindings }>) {
  return getId(context, "inbox");
}

const ObjectSchemaSchema = z
  .union([z.looseObject({}), z.boolean()])
  .openapi({
    description: "A JSON Schema to filter the message data by.",
  });

const SinceSeqSchema = z.int().min(0);

const QueryBodySchema = z.object({
  tags: TagsSchema,
  schema: ObjectSchemaSchema,
});

const CursorBodySchema = z.object({ cursor: z.string().min(1) });
const QueryRequestBodySchema = z.union([QueryBodySchema, CursorBodySchema]);

const QueryCursorSchema = z.object({
  sinceSeq: SinceSeqSchema,
  tags: TagsSchema,
  objectSchema: ObjectSchemaSchema,
  createdAt: z.number(),
  waitTil: z.number().optional(),
  pageSizeStep: z.int().min(0).max(QUERY_PAGE_LIMITS.length - 1).optional(),
});

const QueryResultsSchema = z.object({
  results: z.array(InboxMessageSchema),
  hasMore: z.boolean(),
  cursor: z.string(),
});

const ExportCursorSchema = z.object({
  sinceSeq: SinceSeqSchema,
  createdAt: z.number(),
  waitTil: z.number().optional(),
});

const PutMessageSchema = z.object({
  id: z.string().optional(),
  m: MessageSchema,
});

const inboxes = new Hono<{ Bindings: Bindings }>();

const inbox = new OpenAPIHono<{ Bindings: Bindings }>();
augmentService(inbox, "inbox");

const sendRoute = createRoute({
  method: "put",
  description: "Sends a message to the inbox, returning the message ID",
  tags: ["Inbox"],
  path: "/send",
  request: {
    body: {
      content: {
        "application/cbor": {
          schema: PutMessageSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Message already sent",
      content: {
        "application/cbor": {
          schema: z.object({
            id: z.string(),
          }),
        },
      },
    },
    201: {
      description: "Message sent successfully",
      content: {
        "application/cbor": {
          schema: z.object({
            id: z.string(),
          }),
        },
      },
    },
    404: { description: "Inbox not found" },
  },
});
inbox.use(
  "/send",
  bodyLimit({
    maxSize: MAX_MESSAGE_SIZE_BYTES,
    onError: (c) => {
      throw new HTTPException(413, { message: "Body is too large." });
    },
  }),
);
inbox.openapi(sendRoute, async (c) => {
  const inboxId = getInboxId(c);
  const messageBlob = await c.req.blob();
  const messageBytes = await messageBlob.arrayBuffer();
  let message: z.infer<typeof PutMessageSchema>;
  try {
    const messageDecoded = dagCborDecode(messageBytes);
    message = PutMessageSchema.parse(messageDecoded);
  } catch (e) {
    throw new HTTPException(400, { message: "Invalid message format" });
  }
  // TODO: allow user's to assign message IDs in their own inbox
  // for portability.
  const { messageId, created } = await sendMessage(c, inboxId, message.m);
  const output = { id: messageId };
  return c.body(dagCborEncode(output).slice(), created ? 201 : 200, {
    "Content-Type": "application/cbor",
  });
});

const PinBodySchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(100) }).strict();

for (const operation of ["pin", "unpin"] as const) {
  inbox.use(`/${operation}`, bodyLimit({ maxSize: MAX_MESSAGE_SIZE_BYTES }));
  inbox.openapi(createRoute({
    method: "post",
    path: `/${operation}`,
    tags: ["Inbox"],
    description: operation === "pin"
      ? "Keep up to 100 messages on behalf of the authenticated account"
      : "Remove the authenticated account's pins from up to 100 messages",
    security: [{ oauth2: [] }],
    request: { body: { required: true, content: { "application/cbor": { schema: PinBodySchema } } } },
    responses: {
      204: { description: "Pins updated" },
      400: { description: "Invalid message IDs" },
      401: { description: "Invalid authorization" },
      403: { description: "Cannot pin messages in someone else's inbox" },
      404: { description: "A message to pin does not exist; no pins were added" },
      413: { description: "Body too large" },
    },
  }), async (c) => {
    const { accountId } = await verifySessionHeader(c);
    let body: z.infer<typeof PinBodySchema>;
    try {
      body = PinBodySchema.parse(dagCborDecode(await c.req.arrayBuffer()));
    } catch {
      throw new HTTPException(400, { message: "Invalid pin body" });
    }
    await setMessagePins(c, getInboxId(c), body.ids, accountId, operation === "pin");
    return c.body(null, 204);
  });
}

const queryRoute = createRoute({
  method: "post",
  path: "/query",
  tags: ["Inbox"],
  description: "Query messages that have been sent to the inbox",
  request: {
    body: {
      required: true,
      content: {
        "application/cbor": {
          schema: QueryRequestBodySchema,
        },
      },
    },
  },
  security: [{ oauth2: [] }],
  responses: {
    200: {
      description: "Messages queried successfully",
      content: {
        "application/cbor": {
          schema: QueryResultsSchema,
        },
      },
    },
    400: { description: "Invalid query body" },
    401: { description: "Invalid authorization" },
    403: {
      description: "Cannot query messages in someone else's inbox",
    },
    410: { description: "Cursor expired or otherwise invalid" },
  },
});
inbox.openapi(queryRoute, async (c) => {
  let token: string | undefined = undefined;
  try {
    token = await getHeaderToken(c);
  } catch {} // Not to worry if not present

  const accountId = token ? (await verifySessionHeader(c)).accountId : undefined;

  const inboxId = getInboxId(c);

  let queryBody: z.infer<typeof QueryRequestBodySchema>;
  try {
    queryBody = QueryRequestBodySchema.parse(
      dagCborDecode(await c.req.arrayBuffer()),
    );
  } catch {
    throw new HTTPException(400, { message: "Invalid query body" });
  }

  let objectSchema: {};
  let tags: Uint8Array[] | undefined = undefined;
  let sinceSeq: number | undefined = undefined;
  let pageSizeStep = 0;
  if ("cursor" in queryBody) {
    let createdAt: number;
    let waitTil: number | undefined;
    try {
      const cursorBytes = decodeBase64(queryBody.cursor);
      const cursorDecoded = dagCborDecode(cursorBytes);
      const cursorParsed = QueryCursorSchema.parse(cursorDecoded);
      sinceSeq = cursorParsed.sinceSeq;
      tags = cursorParsed.tags;
      objectSchema = cursorParsed.objectSchema;
      createdAt = cursorParsed.createdAt;
      waitTil = cursorParsed.waitTil;
      // Cursors issued before adaptive paging have no page-size step.
      pageSizeStep = cursorParsed.pageSizeStep ?? QUERY_PAGE_LIMITS.length - 1;
    } catch {
      throw new HTTPException(410, { message: "Invalid cursor" });
    }
    if (createdAt + MESSAGE_RETENTION_PERIOD_MS < Date.now()) {
      throw new HTTPException(410, { message: "Cursor expired" });
    }
    if (waitTil && waitTil > Date.now()) {
      throw new HTTPException(429, { message: "Rate limit exceeded" });
    }
  } else {
    tags = queryBody.tags;
    objectSchema = queryBody.schema;
  }

  const createdAt = Date.now();

  const { results, hasMore, lastSeq } = await queryMessages(
    c,
    inboxId,
    tags,
    objectSchema,
    accountId,
    sinceSeq,
    QUERY_PAGE_LIMITS[pageSizeStep],
  );

  // Construct a cursor
  const cursorCBOR: z.infer<typeof QueryCursorSchema> = {
    tags,
    objectSchema,
    sinceSeq: lastSeq,
    createdAt,
    pageSizeStep: Math.min(pageSizeStep + 1, QUERY_PAGE_LIMITS.length - 1),
    ...(!hasMore
      ? {
          waitTil: Date.now() + RATE_LIMIT_SECONDS * 1000,
        }
      : {}),
  };
  const cursorBytes = dagCborEncode(cursorCBOR);
  const cursor = encodeBase64(cursorBytes);

  const queryResults: z.infer<typeof QueryResultsSchema> = {
    results,
    hasMore,
    cursor,
  };

  return c.body(dagCborEncode(queryResults).slice(), 200, {
    "Content-Type": "application/cbor",
    ...(!hasMore
      ? {
          "Retry-After": String(RATE_LIMIT_SECONDS),
        }
      : {}),
  });
});

const exportRoute = createRoute({
  method: "post",
  path: "/export",
  tags: ["Inbox"],
  description: "Export all messages sent to the inbox",
  request: {
    body: {
      required: true,
      content: {
        "application/cbor": { schema: ExportBodySchema },
      },
    },
  },
  security: [{ oauth2: [] }],
  responses: {
    200: {
      description: "Exported messages successfully",
      content: {
        "application/cbor": {
          schema: QueryResultsSchema,
        },
      },
    },
    400: { description: "Invalid export body" },
    401: { description: "Invalid authorization" },
    403: {
      description: "Cannot export from someone else's inbox",
    },
    410: { description: "Cursor expired or otherwise invalid" },
  },
});

// Export messages
inbox.openapi(exportRoute, async (c) => {
  const { accountId } = await verifySessionHeader(c);
  const inboxId = getInboxId(c);
  let body: z.infer<typeof ExportBodySchema>;
  try {
    body = ExportBodySchema.parse(dagCborDecode(await c.req.arrayBuffer()));
  } catch {
    throw new HTTPException(400, { message: "Invalid export body" });
  }

  let sinceSeq: number | undefined = undefined;
  if (body.cursor) {
    let createdAt: number;
    let waitTil: number | undefined;
    try {
      const cursorBytes = decodeBase64(body.cursor);
      const cursorDecoded = dagCborDecode(cursorBytes);
      const cursorParsed = ExportCursorSchema.parse(cursorDecoded);
      sinceSeq = cursorParsed.sinceSeq;
      createdAt = cursorParsed.createdAt;
      waitTil = cursorParsed.waitTil;
    } catch (error) {
      throw new HTTPException(410, { message: "Invalid cursor." });
    }
    if (createdAt + MESSAGE_RETENTION_PERIOD_MS < Date.now()) {
      throw new HTTPException(410, { message: "Cursor expired" });
    }
    if (waitTil && waitTil > Date.now()) {
      throw new HTTPException(429, { message: "Rate limit exceeded" });
    }
  }

  const createdAt = Date.now();
  const { results, lastSeq, hasMore } = await exportMessages(
    c,
    inboxId,
    accountId,
    sinceSeq,
  );

  const cursorCBOR: z.infer<typeof ExportCursorSchema> = {
    sinceSeq: lastSeq,
    createdAt,
    ...(!hasMore
      ? {
          waitTil: Date.now() + RATE_LIMIT_SECONDS * 1000,
        }
      : {}),
  };
  const cursorBytes = dagCborEncode(cursorCBOR);
  const cursor = encodeBase64(cursorBytes);

  const exportResults: z.infer<typeof QueryResultsSchema> = {
    results,
    hasMore,
    cursor,
  };

  return c.body(dagCborEncode(exportResults).slice(), 200, {
    "Content-Type": "application/cbor",
    ...(!hasMore
      ? {
          "Retry-After": String(RATE_LIMIT_SECONDS),
        }
      : {}),
  });
});

inboxes.route("/:inboxId", inbox);

export default inboxes;
