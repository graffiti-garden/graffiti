import type { Context } from "hono";
import type { Bindings } from "../../env";
import { HTTPException } from "hono/http-exception";
import { LRUCache } from "lru-cache";

const BUCKET_INFO_CACHE_CAPACITY = 1000;
const bucketInfoCache = new LRUCache<
  string,
  { value: { userId: number; bucketSeq: number } | null }
>({ max: BUCKET_INFO_CACHE_CAPACITY });

async function getBucketInfo(
  context: Context<{ Bindings: Bindings }>,
  bucketId: string,
) {
  const cached = bucketInfoCache.get(bucketId);

  if (cached) {
    return cached.value;
  } else {
    const result = await context.env.DB.prepare(
      "SELECT user_id, bucket_seq FROM storage_buckets WHERE bucket_id = ?",
    )
      .bind(bucketId)
      .first<{ user_id: number; bucket_seq: number }>();

    const output = result
      ? {
          userId: result.user_id,
          bucketSeq: result.bucket_seq,
        }
      : null;

    bucketInfoCache.set(bucketId, { value: output });

    return output;
  }
}

async function verifyBucketControl(
  context: Context<{ Bindings: Bindings }>,
  bucketId: string,
  userId: number,
) {
  const info = await getBucketInfo(context, bucketId);
  if (!info) {
    throw new HTTPException(404, { message: "Bucket not found" });
  }
  if (info.userId !== userId) {
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
  userId: number,
) {
  const bucketKey = getBucketKey(bucketId, key);

  await verifyBucketControl(context, bucketId, userId);

  await context.env.STORAGE.put(bucketKey, body);

  return context.body(null, 201);
}

export async function deleteValue(
  context: Context<{ Bindings: Bindings }>,
  bucketId: string,
  key: string,
  userId: number,
) {
  await verifyBucketControl(context, bucketId, userId);

  const bucketKey = getBucketKey(bucketId, key);
  await context.env.STORAGE.delete(bucketKey);

  return context.body(null, 204);
}

export async function exportKeys(
  context: Context<{ Bindings: Bindings }>,
  bucketId: string,
  cursor: string | undefined,
  userId: number,
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
