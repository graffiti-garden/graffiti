import { Hono, type Context } from "hono";
import type { Bindings } from "../../env";
import { HTTPException } from "hono/http-exception";
import { verifySessionHeader } from "../../app/auth/session";
import { z, createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { augmentService, getId } from "../shared";
import { getValue, getValues, putValue, deleteValue, exportKeys } from "./db";
import { bodyLimit } from "hono/body-limit";
import { encode as dagCborEncode, decode as dagCborDecode } from "@ipld/dag-cbor";

const MAX_VALUE_SIZE = 25 * 1024 * 1024; // 25mb
// Every batch-capable server accepts this baseline, so clients do not need
// to ask what a server's accepted batch size is. In testing, larger batches
// give little additional benefit.
const MAX_BATCH_KEYS = 32;
// 1mb of value bytes keeps the buffered CBOR response bounded and lets one
// request carry 32 Graffiti validation values of up to 32kb each. Both the
// per-value limit and keys.length * maxValueBytes must fit this budget.
const MAX_BATCH_TOTAL_VALUE_BYTES = 1024 * 1024; // 1mb = 32 * 32kb
// 32kb covers 32 maximum-length keys (255 UTF-16 code units each). Such
// keys can occupy about 24 KiB in UTF-8, plus CBOR framing.
const MAX_BATCH_BODY_BYTES = 32 * 1024;

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
  path: "/value/{key}",
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

const batchResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal(200),
    value: BinaryDataSchema,
    etag: z.string(),
  }),
  z.object({ status: z.literal(404) }),
  z.object({ status: z.literal(413) }),
]);
const BatchRequestSchema = z.object({
  keys: z.array(KeySchema).min(1).max(MAX_BATCH_KEYS),
  maxValueBytes: z.number().int().min(0).max(MAX_BATCH_TOTAL_VALUE_BYTES),
});

const getValuesRoute = createRoute({
  method: "post",
  description: "Gets the binary data values associated with several key from the bucket. Results are in key order",
  tags: ["Storage Bucket"],
  path: "/values",
  request: {
    body: {
      required: true,
      content: {
        "application/cbor": {
          schema: BatchRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Per-key values or errors in request order",
      content: {
        "application/cbor": {
          schema: z.object({ results: z.array(batchResultSchema) }),
        },
      },
    },
    400: { description: "Invalid batch or response byte limit exceeded" },
    413: { description: "Request body is too large" },
  },
});

storageBucket.use(
  "/values",
  bodyLimit({
    maxSize: MAX_BATCH_BODY_BYTES,
    onError: () => {
      throw new HTTPException(413, { message: "Batch body is too large" });
    },
  }),
);
storageBucket.openapi(getValuesRoute, async (c) => {
  let input: z.infer<typeof BatchRequestSchema>;
  try {
    input = BatchRequestSchema.parse(dagCborDecode(await c.req.arrayBuffer()));
  } catch {
    throw new HTTPException(400, { message: "Invalid batch body" });
  }
  if (input.keys.length * input.maxValueBytes > MAX_BATCH_TOTAL_VALUE_BYTES) {
    throw new HTTPException(400, { message: "Batch response byte limit exceeded" });
  }
  const results = await getValues(c, getBucketId(c), input.keys, input.maxValueBytes);
  return c.body(dagCborEncode({ results }).slice(), 200, {
    "Content-Type": "application/cbor",
  });
});

const putValueRoute = createRoute({
  method: "put",
  description: "Puts a binary data value in the bucket associated with a key.",
  tags: ["Storage Bucket"],
  path: "/value/{key}",
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
    201: { description: "Successfully uploaded value" },
    401: { description: "Invalid authorization" },
    403: { description: "Cannot upload to someone else's bucket" },
    413: { description: "Body is too large" },
  },
});
storageBucket.use(
  "/value/:key",
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
  return await putValue(c, bucketId, key, userId);
});

const deleteValueRoute = createRoute({
  method: "delete",
  description: "Deletes the binary value associated with a key from the bucket",
  tags: ["Storage Bucket"],
  path: "/value/{key}",
  request: {
    params: z.object({
      key: KeySchema,
    }),
  },
  security: [{ oauth2: [] }],
  responses: {
    204: { description: "Successfully deleted value" },
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
          "application/cbor": {
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
    const output = await exportKeys(c, bucketId, cursor, userId);
    return c.body(dagCborEncode(output).slice(), 200, {
      "Content-Type": "application/cbor",
    });
  },
);

storageBuckets.route("/:bucketId", storageBucket);

export default storageBuckets;
