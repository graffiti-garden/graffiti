import type { Bindings } from "../../env";
import { HTTPException } from "hono/http-exception";
import { verifySessionHeader } from "../../app/auth/session";
import { z, createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { addAuthRoute, disableCors } from "../shared";
import { getValue, putValue, deleteValue, exportKeys } from "./db";
import { bodyLimit } from "hono/body-limit";

const MAX_VALUE_SIZE = 25 * 1024 * 1024; // 25mb

const BucketIdSchema = z.base64url().length(43);
const KeySchema = z.string().min(1).max(255);
const BinaryDataSchema = z.string().openapi({
  type: "string",
  format: "binary",
});

const storageBuckets = new OpenAPIHono<{ Bindings: Bindings }>();

disableCors(storageBuckets);
addAuthRoute(storageBuckets, "Storage Buckets", "bucketId");

const getValueRoute = createRoute({
  method: "get",
  description:
    "Gets the binary data value associated with a key from a bucket.",
  tags: ["Storage Buckets"],
  path: "/{bucketId}/{key}",
  request: {
    params: z.object({
      bucketId: BucketIdSchema,
      key: KeySchema,
    }),
    headers: z.object({
      "If-None-Match": z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "Successfully retrieved the value",
      content: {
        "application/octet-stream": {
          schema: BinaryDataSchema,
        },
      },
      headers: z.object({
        ETag: z.string(),
      }),
    },
    304: { description: "Not modified" },
    404: {
      description: "Not found",
      content: {
        "text/plain": { schema: z.string() },
      },
    },
  },
});

storageBuckets.openapi(getValueRoute, async (c) => {
  const { bucketId, key } = c.req.valid("param");
  const ifNoneMatch = c.req.header("If-None-Match");
  return await getValue(c, bucketId, key, ifNoneMatch);
});

const putValueRoute = createRoute({
  method: "put",
  description: "Puts a binary data value in a bucket associated with a key.",
  tags: ["Storage Buckets"],
  path: "/{bucketId}/{key}",
  request: {
    params: z.object({
      bucketId: BucketIdSchema,
      key: KeySchema,
    }),
    body: {
      description: "Binary data to upload",
      content: {
        "application/octet-stream": {
          schema: BinaryDataSchema,
        },
      },
      required: true,
    },
    headers: z.object({
      "Content-Length": z.string().optional(),
    }),
  },
  security: [{ oauth2: [] }],
  responses: {
    200: {
      description: "Successfully uploaded value",
      content: {
        "application/json": {
          schema: z.object({ uploaded: z.literal(true) }),
        },
      },
    },
    401: { description: "Invalid authorization" },
    403: { description: "Cannot upload to someone else's bucket" },
    413: { description: "Body is too large" },
  },
});
storageBuckets.use(
  "/:bucketId/:key",
  bodyLimit({
    maxSize: MAX_VALUE_SIZE,
    onError: (c) => {
      throw new HTTPException(413, { message: "Body is too large." });
    },
  }),
);
storageBuckets.openapi(putValueRoute, async (c) => {
  const { bucketId, key } = c.req.valid("param");
  const body = c.req.raw.body;
  if (!body) {
    throw new HTTPException(400, {
      message: "Missing body",
    });
  }
  const { userId } = await verifySessionHeader(c);
  return await putValue(c, bucketId, key, body, userId);
});

const deleteValueRoute = createRoute({
  method: "delete",
  description: "Deletes the binary value associated with a key from a bucket",
  tags: ["Storage Buckets"],
  path: "/{bucketId}/{key}",
  request: {
    params: z.object({
      bucketId: BucketIdSchema,
      key: KeySchema,
    }),
  },
  security: [{ oauth2: [] }],
  responses: {
    200: {
      description: "Successfully deleted value",
      content: {
        "application/json": {
          schema: z.object({ deleted: z.literal(true) }),
        },
      },
    },
    401: { description: "Invalid authorization" },
    403: { description: "Cannot delete from someone else's bucket" },
  },
});
storageBuckets.openapi(deleteValueRoute, async (c) => {
  const { bucketId, key } = c.req.valid("param");
  const { userId } = await verifySessionHeader(c);
  return await deleteValue(c, bucketId, key, userId);
});

storageBuckets.openapi(
  createRoute({
    method: "get",
    description: "Export all keys that have values within a bucket",
    tags: ["Storage Buckets"],
    path: "/{bucketId}",
    request: {
      params: z.object({
        bucketId: BucketIdSchema,
      }),
      query: z.object({
        cursor: z.string().optional().openapi({
          description:
            "An optional cursor to continue receiving keys. A cursor is returned from a previous request if there are more keys to export.",
        }),
      }),
    },
    security: [{ oauth2: [] }],
    responses: {
      200: {
        description: "Successfully exported keys",
        content: {
          "application/json": {
            schema: z.object({
              keys: z.array(z.string()),
              cursor: z.string().nullable(),
            }),
          },
        },
      },
      401: { description: "Invalid authorization" },
      403: { description: "Cannot export from someone else's bucket" },
    },
  }),
  async (c) => {
    const { bucketId } = c.req.valid("param");
    const { cursor } = c.req.valid("query");
    const { userId } = await verifySessionHeader(c);
    return exportKeys(c, bucketId, cursor, userId);
  },
);

export default storageBuckets;
