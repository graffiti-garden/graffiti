import type { Context } from "hono";
import type { Bindings } from "../../env";
import { HTTPException } from "hono/http-exception";
import { LRUCache } from "lru-cache";

const BUCKET_INFO_CACHE_CAPACITY = 1000;
const bucketInfoCache = new LRUCache<
  string,
  { value: { accountId: number; bucketSeq: number } | null }
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
      "SELECT account_id, bucket_seq FROM storage_buckets WHERE bucket_id = ?",
    )
      .bind(bucketId)
      .first<{ account_id: number; bucket_seq: number }>();

    const output = result
      ? {
          accountId: result.account_id,
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
  accountId: number,
) {
  const info = await getBucketInfo(context, bucketId);
  if (!info) {
    throw new HTTPException(404, { message: "Bucket not found" });
  }
  if (info.accountId !== accountId) {
    throw new HTTPException(403, {
      message: "Account does not have access to the bucket",
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
  accountId: number,
) {
  await verifyBucketControl(context, bucketId, accountId);
  return bucket(context, bucketId).putValue(key, context.req.raw);
}

export async function deleteValue(
  context: Context<{ Bindings: Bindings }>,
  bucketId: string,
  key: string,
  accountId: number,
) {
  await verifyBucketControl(context, bucketId, accountId);
  return bucket(context, bucketId).deleteValue(key);
}

export async function exportKeys(
  context: Context<{ Bindings: Bindings }>,
  bucketId: string,
  cursor: string | undefined,
  accountId: number,
) {
  await verifyBucketControl(context, bucketId, accountId);
  return bucket(context, bucketId).exportKeys(cursor);
}
