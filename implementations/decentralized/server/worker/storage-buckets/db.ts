import type { Context } from "hono";
import type { Bindings } from "../env";
import { HTTPException } from "hono/http-exception";

const MAX_SIZE = 25 * 1024 * 1024; // 25mb

async function verifyBucketControl(
  context: Context<{ Bindings: Bindings }>,
  bucketId: string,
  userId: string,
) {
  const result = await context.env.DB.prepare(
    "SELECT bucket_id FROM storage_buckets WHERE bucket_id = ? AND user_id = ?",
  )
    .bind(bucketId, userId)
    .first();

  if (!result) {
    throw new HTTPException(403, {
      message: "User does not have access to the bucket",
    });
  }
}

function getBucketKey(bucketId: string, key: string) {
  return `${bucketId}/${key}`;
}

export async function getValue(
  context: Context<{ Bindings: Bindings }>,
  bucketId: string,
  key: string,
  ifNoneMatch: string | undefined,
) {
  const bucketKey = getBucketKey(bucketId, key);

  const result = await context.env.STORAGE.get(bucketKey, {
    onlyIf: {
      etagDoesNotMatch: ifNoneMatch,
    },
  });

  if (!result) {
    throw new HTTPException(404, { message: "Value not found" });
  }

  const headers = new Headers();
  headers.set("ETag", result.etag);
  if (!("body" in result)) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(result.body, { headers });
}

export async function putValue(
  context: Context<{ Bindings: Bindings }>,
  bucketId: string,
  key: string,
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  userId: string,
  contentLength: number | undefined,
) {
  const bucketKey = getBucketKey(bucketId, key);

  if (contentLength && contentLength > MAX_SIZE) {
    throw new HTTPException(413, { message: "Body is too large" });
  }

  await verifyBucketControl(context, bucketId, userId);

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
    await context.env.STORAGE.put(bucketKey, limitedBody);
  } catch (e: any) {
    if (tooLarge) {
      throw new HTTPException(413, { message: "Body is too large" });
    }
    throw e;
  }

  return context.json({ uploaded: true });
}

export async function deleteValue(
  context: Context<{ Bindings: Bindings }>,
  bucketId: string,
  key: string,
  userId: string,
) {
  await verifyBucketControl(context, bucketId, userId);

  const bucketKey = getBucketKey(bucketId, key);
  await context.env.STORAGE.delete(bucketKey);

  return context.json({ deleted: true });
}

export async function exportKeys(
  context: Context<{ Bindings: Bindings }>,
  bucketId: string,
  cursor: string | undefined,
  userId: string,
) {
  await verifyBucketControl(context, bucketId, userId);

  const prefix = `${bucketId}/`;
  const listed = await context.env.STORAGE.list({ prefix, cursor });
  const keys = listed.objects.map((o) => o.key.slice(prefix.length));

  return context.json({
    keys,
    cursor: listed.truncated ? listed.cursor : null,
  });
}
