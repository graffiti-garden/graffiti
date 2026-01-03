import { Hono, type Context } from "hono";
import type { Bindings } from "../../env";
import { HTTPException } from "hono/http-exception";
import { verifySessionHeader } from "../../app/auth/session";
import { z, createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { augmentService, getId } from "../shared";
import { getValue, putValue, deleteValue, exportKeys } from "./db";
import { bodyLimit } from "hono/body-limit";

const MAX_VALUE_SIZE = 25 * 1024 * 1024; // 25mb

const KeySchema = z.string().min(1).max(255);
const BinaryDataSchema = z.string().openapi({
  type: "string",
  format: "binary",
});
function getBucketId(context: Context<{ Bindings: Bindings }>) {
  return getId(context, "bucket");
}

const storageBuckets = new Hono<{ Bindings: Bindings }>();
const storageBucket = new OpenAPIHono<{ Bindings: Bindings }>();

augmentService(storageBucket, "bucket");

const getValueRoute = createRoute({
  method: "get",
  description:
    "Gets the binary data value associated with a key from the bucket.",
  tags: ["Storage Bucket"],
  path: "/v/{key}",
  request: {
    params: z.object({
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

storageBucket.openapi(getValueRoute, async (c) => {
  const { key } = c.req.valid("param");
  const bucketId = getBucketId(c);
  const ifNoneMatch = c.req.header("If-None-Match");
  return await getValue(c, bucketId, key, ifNoneMatch);
});

const putValueRoute = createRoute({
  method: "put",
  description: "Puts a binary data value in the bucket associated with a key.",
  tags: ["Storage Bucket"],
  path: "/v/{key}",
  request: {
    params: z.object({
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
storageBucket.use(
  "/v/:key",
  bodyLimit({
    maxSize: MAX_VALUE_SIZE,
    onError: (c) => {
      throw new HTTPException(413, { message: "Body is too large." });
    },
  }),
);
storageBucket.openapi(putValueRoute, async (c) => {
  const { key } = c.req.valid("param");
  const bucketId = getBucketId(c);
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
  description: "Deletes the binary value associated with a key from the bucket",
  tags: ["Storage Bucket"],
  path: "/v/{key}",
  request: {
    params: z.object({
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
storageBucket.openapi(deleteValueRoute, async (c) => {
  const { key } = c.req.valid("param");
  const bucketId = getBucketId(c);
  const { userId } = await verifySessionHeader(c);
  return await deleteValue(c, bucketId, key, userId);
});

storageBucket.openapi(
  createRoute({
    method: "get",
    description: "Export all keys that have values within a bucket",
    tags: ["Storage Bucket"],
    path: "/export",
    request: {
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
    const { cursor } = c.req.valid("query");
    const bucketId = getBucketId(c);
    const { userId } = await verifySessionHeader(c);
    return exportKeys(c, bucketId, cursor, userId);
  },
);

storageBuckets.route("/:bucketId", storageBucket);

export default storageBuckets;
