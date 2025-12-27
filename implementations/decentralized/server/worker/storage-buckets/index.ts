import { Hono } from "hono";
import type { Bindings } from "../env";

const storageBuckets = new Hono<{ Bindings: Bindings }>();

storageBuckets.use("*", async (c, next) => {
  // Disable CORs
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  await next();
});

storageBuckets.get("/:bucket/:key", async (c) => {
  const bucket = c.req.param("bucket");
  const key = c.req.param("key");

  return c.json({
    bucket,
    key,
  });
});

export default storageBuckets;
