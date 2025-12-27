import { Hono, type Context } from "hono";
import type { Bindings } from "../env";
import { HTTPException } from "hono/http-exception";
import { verifySessionHeader } from "../app/auth/session";

async function verifyBucketControl(
  context: Context<{ Bindings: Bindings }>,
  bucket: string,
) {
  const { userId } = await verifySessionHeader(context);

  const result = await context.env.DB.prepare(
    `SELECT created_at FROM service_instances WHERE service_id = ? AND user_id = ? AND type = ?`,
  )
    .bind(bucket, userId, "bucket")
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
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  await next();
});

storageBuckets.get("/:bucket/:key", async (c) => {
  const bucket = c.req.param("bucket");
  const key = c.req.param("key");

  const bucketKey = `${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`;

  // Return the result straight from the bucket
  const result = await c.env.BUCKET.get(bucketKey);
  if (!result) {
    throw new HTTPException(404, {
      message: "File not found",
    });
  }
  return new Response(result.body);
});

storageBuckets.put("/:bucket/:key", async (c) => {
  const bucket = c.req.param("bucket");
  await verifyBucketControl(c, bucket);

  const key = c.req.param("key");
  const bucketKey = `${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`;
  const body = await c.req.blob();

  await c.env.BUCKET.put(bucketKey, body);
  return c.json({ uploaded: true });
});

storageBuckets.delete("/:bucket/:key", async (c) => {
  const bucket = c.req.param("bucket");
  await verifyBucketControl(c, bucket);

  const key = c.req.param("key");
  const bucketKey = `${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`;
  await c.env.BUCKET.delete(bucketKey);
  return c.json({ deleted: true });
});

storageBuckets.get("/:bucket/", async (c) => {
  const bucket = c.req.param("bucket");
  await verifyBucketControl(c, bucket);

  const listed = await c.env.BUCKET.list({ prefix: bucket });
  const keys = listed.objects.map((o) => o.key);
  return c.json({ keys });
});

export default storageBuckets;
