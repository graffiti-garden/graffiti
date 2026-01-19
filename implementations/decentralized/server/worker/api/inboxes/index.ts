import { Hono, type Context } from "hono";
import type { Bindings } from "../../env";
import { HTTPException } from "hono/http-exception";
import { getHeaderToken, verifySessionHeader } from "../../app/auth/session";
import {
  sendMessage,
  labelMessage,
  queryMessages,
  exportMessages,
  MessageSchema,
  LabeledMessageSchema,
  getMessage,
} from "./db";
import { z, createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { augmentService, getId } from "../shared";
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

function getInboxId(context: Context<{ Bindings: Bindings }>) {
  return getId(context, "inbox");
}

const ObjectSchemaSchema = z.looseObject({}).openapi({
  description: "A JSON Schema to filter the message data by.",
});

const LabelSchema = z.int().min(0).openapi({
  description:
    "An integer label for the message indicating whether it is worth keeping",
  example: 1,
});
const LabelBodySchema = z.object({
  l: LabelSchema.min(1),
});

const SinceSeqSchema = z.int().min(0);

const QueryBodySchema = z.object({
  tags: TagsSchema,
  schema: ObjectSchemaSchema,
});

const QueryCursorSchema = z.object({
  sinceSeq: SinceSeqSchema,
  tags: TagsSchema,
  objectSchema: ObjectSchemaSchema,
  createdAt: z.number(),
  waitTil: z.number().optional(),
});

const QueryResultsSchema = z.object({
  results: z.array(LabeledMessageSchema),
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
  // for portability... and perhaps assign labels too
  const { messageId, created } = await sendMessage(c, inboxId, message.m);
  const output = { id: messageId };
  return c.body(dagCborEncode(output).slice(), created ? 201 : 200, {
    "Content-Type": "application/cbor",
  });
});

const messageRoute = createRoute({
  method: "get",
  description: "Get a message from the inbox via its message ID",
  tags: ["Inbox"],
  path: "/message/{messageId}",
  request: {
    params: z.object({
      messageId: z.string(),
    }),
  },
  security: [{ oauth2: [] }],
  responses: {
    200: {
      description: "Message retrieved",
      content: {
        "application/cbor": {
          schema: LabeledMessageSchema,
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
inbox.openapi(messageRoute, async (c) => {
  let token: string | undefined = undefined;
  try {
    token = await getHeaderToken(c);
  } catch {} // Not to worry if not present
  const userId = token ? (await verifySessionHeader(c)).userId : undefined;
  const inboxId = getInboxId(c);

  const { messageId } = c.req.valid("param");

  const message = await getMessage(c, inboxId, messageId, userId);
  return c.body(dagCborEncode(message).slice(), 200, {
    "Content-Type": "application/cbor",
  });
});

const labelRoute = createRoute({
  method: "put",
  description:
    "Label an message in the inbox as 'ok', 'expired', 'incorrect', 'junk', etc.",
  tags: ["Inbox"],
  path: "/label/{messageId}",
  request: {
    params: z.object({
      messageId: z.string(),
    }),
    body: {
      content: {
        "application/cbor": {
          schema: LabelBodySchema,
        },
      },
      required: true,
    },
  },
  security: [{ oauth2: [] }],
  responses: {
    200: { description: "Message labeled successfully" },
    401: { description: "Invalid authorization" },
    403: {
      description: "Cannot label an message in someone else's inbox",
    },
    404: { description: "Message not found" },
  },
});

inbox.openapi(labelRoute, async (c) => {
  const { userId } = await verifySessionHeader(c);
  const inboxId = getInboxId(c);
  const { messageId } = c.req.valid("param");
  const bodyBlob = await c.req.blob();
  const bodyBytes = await bodyBlob.arrayBuffer();
  let labelBody: z.infer<typeof LabelBodySchema>;
  try {
    const bodyDecoded = dagCborDecode(bodyBytes);
    labelBody = LabelBodySchema.parse(bodyDecoded);
  } catch (e) {
    throw new HTTPException(400, { message: "Invalid label body format" });
  }
  await labelMessage(c, inboxId, messageId, labelBody.l, userId);
  return c.body(null, 200);
});

const queryRoute = createRoute({
  method: "post",
  path: "/query",
  tags: ["Inbox"],
  description: "Query messages that have been sent to the inbox",
  request: {
    query: z.object({
      cursor: z.string().optional(),
    }),
    body: {
      content: {
        "application/cbor": {
          schema: QueryBodySchema,
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

  const userId = token ? (await verifySessionHeader(c)).userId : undefined;

  const inboxId = getInboxId(c);

  const { cursor: cursorParam } = c.req.valid("query");

  let objectSchema: {};
  let tags: Uint8Array[] | undefined = undefined;
  let sinceSeq: number | undefined = undefined;
  if (cursorParam) {
    let createdAt: number;
    let waitTil: number | undefined;
    try {
      const cursorBytes = decodeBase64(cursorParam);
      const cursorDecoded = dagCborDecode(cursorBytes);
      const cursorParsed = QueryCursorSchema.parse(cursorDecoded);
      sinceSeq = cursorParsed.sinceSeq;
      tags = cursorParsed.tags;
      objectSchema = cursorParsed.objectSchema;
      createdAt = cursorParsed.createdAt;
      waitTil = cursorParsed.waitTil;
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
    const queryParamsBlob = await c.req.blob();
    const queryParamsBytes = await queryParamsBlob.arrayBuffer();
    let queryParams: z.infer<typeof QueryBodySchema>;
    try {
      const queryParamsDecoded = dagCborDecode(queryParamsBytes);
      queryParams = QueryBodySchema.parse(queryParamsDecoded);
    } catch (e) {
      throw new HTTPException(400, { message: "Invalid query body" });
    }
    tags = queryParams.tags;
    objectSchema = queryParams.schema;
  }

  const createdAt = Date.now();

  const { results, hasMore, lastSeq } = await queryMessages(
    c,
    inboxId,
    tags,
    objectSchema,
    userId,
    sinceSeq,
  );

  // Construct a cursor
  const cursorCBOR: z.infer<typeof QueryCursorSchema> = {
    tags,
    objectSchema,
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
    query: z.object({
      cursor: z.string().optional(),
    }),
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
    401: { description: "Invalid authorization" },
    403: {
      description: "Cannot export from someone else's inbox",
    },
  },
});

// Export messages
inbox.openapi(exportRoute, async (c) => {
  const { userId } = await verifySessionHeader(c);
  const inboxId = getInboxId(c);
  const { cursor: cursorParam } = c.req.valid("query");

  let sinceSeq: number | undefined = undefined;
  if (cursorParam) {
    let createdAt: number;
    let waitTil: number | undefined;
    try {
      const cursorBytes = decodeBase64(cursorParam);
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
    userId,
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
