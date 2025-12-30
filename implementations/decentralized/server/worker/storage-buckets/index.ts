import type { Context } from "hono";
import type { Bindings } from "../env";
import { HTTPException } from "hono/http-exception";
import { verifySessionHeader } from "../app/auth/session";
import { z, createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { addAuthRoute, disableCors } from "../api/shared";
import { getValue, putValue, deleteValue, exportKeys } from "./db";

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
      description: "Returns the binary file data",
      content: {
        "application/octet-stream": {
          schema: BinaryDataSchema,
        },
      },
      headers: z.object({
        ETag: z.string(),
      }),
    },
    304: {
      description: "File not modified",
    },
    404: {
      description: "File not found",
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
      description: "Upload succeeded",
      content: {
        "application/json": {
          schema: z.object({ uploaded: z.literal(true) }),
        },
      },
    },
    400: {
      description: "Bad request (missing body / invalid Content-Length)",
      content: {
        "application/json": { schema: z.object({ message: z.string() }) },
      },
    },
    413: {
      description: "Body is too large",
      content: {
        "application/json": { schema: z.object({ message: z.string() }) },
      },
    },
    401: { description: "Unauthorized" },
    403: { description: "Forbidden" },
  },
});
storageBuckets.openapi(putValueRoute, async (c) => {
  const { bucketId, key } = c.req.valid("param");
  const body = c.req.raw.body;
  if (!body) {
    throw new HTTPException(400, {
      message: "Missing body",
    });
  }
  const { "Content-Length": contentLengthString } = c.req.valid("header");
  const contentLength = contentLengthString
    ? Number(contentLengthString)
    : undefined;
  // If it is nan or infinite, filter it out
  if (
    Number.isNaN(contentLength) ||
    contentLength === Infinity ||
    contentLength === -Infinity
  ) {
    throw new HTTPException(400, { message: "Content length is not a number" });
  }
  const { userId } = await verifySessionHeader(c);
  return await putValue(c, bucketId, key, body, userId, contentLength);
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
      description: "Delete succeeded",
      content: {
        "application/json": {
          schema: z.object({ deleted: z.literal(true) }),
        },
      },
    },
    401: { description: "Unauthorized" },
    403: { description: "Forbidden" },
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
            "An optional cursor to continue receiving keys, returned from a previous request",
        }),
      }),
    },
    security: [{ oauth2: [] }],
    responses: {
      200: {
        description: "Exported keys successfully",
        content: {
          "application/json": {
            schema: z.object({
              keys: z.array(z.string()),
              cursor: z.string().nullable(),
            }),
          },
        },
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
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
