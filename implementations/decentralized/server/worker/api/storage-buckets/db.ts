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

function bucket(context: Context<{ Bindings: Bindings }>, bucketId: string) {
  return context.env.BUCKETS.get(context.env.BUCKETS.idFromName(bucketId));
}

export async function getValue(
  context: Context<{ Bindings: Bindings }>,
  bucketId: string,
  key: string,
  ifNoneMatch?: string,
) {
  return bucket(context, bucketId).getValue(key, ifNoneMatch);
}

export async function getValues(
  context: Context<{ Bindings: Bindings }>,
  bucketId: string,
  keys: string[],
  maxValueBytes: number,
) {
  return bucket(context, bucketId).getValues(keys, maxValueBytes);
}

export async function putValue(
  context: Context<{ Bindings: Bindings }>,
  bucketId: string,
  key: string,
  userId: number,
) {
  await verifyBucketControl(context, bucketId, userId);
  return bucket(context, bucketId).putValue(key, context.req.raw);
}

export async function deleteValue(
  context: Context<{ Bindings: Bindings }>,
  bucketId: string,
  key: string,
  userId: number,
) {
  await verifyBucketControl(context, bucketId, userId);
  return bucket(context, bucketId).deleteValue(key);
}

export async function exportKeys(
  context: Context<{ Bindings: Bindings }>,
  bucketId: string,
  cursor: string | undefined,
  userId: number,
) {
  await verifyBucketControl(context, bucketId, userId);
  return bucket(context, bucketId).exportKeys(cursor);
}
