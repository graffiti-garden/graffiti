import { Hono, type Context } from "hono";
import type { Bindings } from "../env";
import { HTTPException } from "hono/http-exception";
import { verifySessionHeader } from "../app/auth/session";
import { z } from "zod";

const MAX_SIZE = 25 * 1024 * 1024; // 25mb

const bucketIdSchema = z.base64url().length(44);
function verifyBucketId(bucketId: string) {
  const result = bucketIdSchema.safeParse(bucketId);
  if (!result.success) {
    throw new HTTPException(400, {
      message: `Invalid bucket ID: ${result.error.issues.map((i) => i.message).join(", ")}`,
    });
  }
}

async function verifyBucketControl(
  context: Context<{ Bindings: Bindings }>,
  bucketId: string,
) {
  verifyBucketId(bucketId);

  const { userId } = await verifySessionHeader(context);

  const result = await context.env.DB.prepare(
    `SELECT service_id FROM service_instances WHERE service_id = ? AND user_id = ? AND type = ?`,
  )
    .bind(bucketId, userId, "bucket")
    .first();

  if (!result) {
    throw new HTTPException(404, {
      message:
        "Either the user does not have access to the bucket, or it does not exist.",
    });
  }
}

const storageBuckets = new Hono<{ Bindings: Bindings }>();

storageBuckets.use("*", async (c, next) => {
  // Disable CORs
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  c.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, If-None-Match",
  );
  await next();
});

storageBuckets.get("/auth", async (c) => {
  const headers = new Headers();
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return c.text(`gf:a:oauth:${c.env.BASE_HOST}/oauth`, { headers });
});

storageBuckets.get("/:bucket-id/:key", async (c) => {
  const bucketId = c.req.param("bucket-id");
  verifyBucketId(bucketId);

  const key = c.req.param("key");
  const bucketKey = `${bucketId}/${key}`;

  const ifNoneMatch = c.req.header("If-None-Match");
  const result = await c.env.STORAGE.get(bucketKey, {
    onlyIf: {
      etagDoesNotMatch: ifNoneMatch,
    },
  });

  if (!result) {
    throw new HTTPException(404, {
      message: "File not found",
    });
  }

  const headers = new Headers();
  headers.set("ETag", result.etag);
  if (!("body" in result)) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(result.body, { headers });
});

storageBuckets.put("/:bucket-id/:key", async (c) => {
  const bucketId = c.req.param("bucket-id");
  await verifyBucketControl(c, bucketId);

  const key = c.req.param("key");
  const bucketKey = `${bucketId}/${key}`;
  const body = c.req.raw.body;
  if (!body) {
    throw new HTTPException(400, {
      message: "Missing body",
    });
  }

  // Reject anything too big
  const contentLengthHeader = c.req.header("Content-Length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isFinite(contentLength)) {
      throw new HTTPException(400, { message: "Invalid Content-Length" });
    }
    if (contentLength > MAX_SIZE) {
      throw new HTTPException(413, { message: "Body is too large" });
    }
  }

  // Just in case the content length header is
  // inaccurate, limit the body size manually
  const reader = body.getReader();
  let totalBytes = 0;
  let tooLarge = false;
  const limitedBody = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) return controller.close();

      totalBytes += value.byteLength;
      if (totalBytes > MAX_SIZE) {
        tooLarge = true;
        controller.error(new Error("Body is too large"));
        void reader.cancel("Body is too large").catch(() => {});
        return;
      }

      controller.enqueue(value);
    },
    async cancel(reason) {
      return reader.cancel(reason).catch(() => {});
    },
  });

  try {
    await c.env.STORAGE.put(bucketKey, limitedBody);
  } catch (e: any) {
    if (tooLarge) {
      throw new HTTPException(413, { message: "Body is too large" });
    }
    throw e;
  }
  return c.json({ uploaded: true });
});

storageBuckets.delete("/:bucket-id/:key", async (c) => {
  const bucketId = c.req.param("bucket-id");
  await verifyBucketControl(c, bucketId);

  const key = c.req.param("key");
  const bucketKey = `${bucketId}/${key}`;
  await c.env.STORAGE.delete(bucketKey);
  return c.json({ deleted: true });
});

// List all keys in the bucket
storageBuckets.get("/:bucket-id", async (c) => {
  const bucketId = c.req.param("bucket-id");
  await verifyBucketControl(c, bucketId);

  const cursor = c.req.query("cursor");

  const listed = await c.env.STORAGE.list({ prefix: `${bucketId}/`, cursor });
  const keys = listed.objects.map((o) => o.key.slice(bucketId.length + 1));

  return c.json({
    keys,
    cursor: listed.truncated ? listed.cursor : null,
  });
});

export default storageBuckets;
