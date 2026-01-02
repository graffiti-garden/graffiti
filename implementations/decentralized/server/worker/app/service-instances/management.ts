import { Hono } from "hono";
import type { Bindings } from "../../env";
import { verifySessionCookie } from "../auth/session";
import { randomBase64 } from "../auth/utils";
import { HTTPException } from "hono/http-exception";

const serviceInstances = new Hono<{ Bindings: Bindings }>();

function tableFromType(type: string) {
  return type === "bucket" ? "storage_buckets" : "inboxes";
}

function idNameFromType(type: string) {
  return type === "bucket" ? "bucket_id" : "inbox_id";
}

serviceInstances.post("/:type/create", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const type = c.req.param("type");
  const { name } = await c.req.json();
  const table = tableFromType(type);
  const idName = idNameFromType(type);

  const serviceId = randomBase64();
  const createdAt = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO ${table} (${idName}, name, user_id, created_at) VALUES (?, ?, ?, ?)`,
  )
    .bind(serviceId, name, userId, createdAt)
    .run();

  return c.json({ serviceId, createdAt });
});

// rename
serviceInstances.put("/:type/service/:service-id", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const type = c.req.param("type");
  const serviceId = c.req.param("service-id");
  const { name } = await c.req.json();
  const table = tableFromType(type);
  const idName = idNameFromType(type);

  const result = await c.env.DB.prepare(
    `UPDATE ${table} SET name = ? WHERE ${idName} = ? AND user_id = ? RETURNING user_id`,
  )
    .bind(name, serviceId, userId)
    .first();
  if (!result) {
    throw new HTTPException(404, { message: "Instance not found" });
  }
  return c.json({});
});

serviceInstances.delete("/:type/service/:service-id", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const type = c.req.param("type");
  const serviceId = c.req.param("service-id");
  const table = tableFromType(type);
  const idName = idNameFromType(type);

  const result = await c.env.DB.prepare(
    `DELETE FROM ${table} WHERE ${idName} = ? AND user_id = ? RETURNING user_id`,
  )
    .bind(serviceId, userId)
    .first();

  // TODO: If it is a bucket, delete all the items in storage

  if (!result) {
    throw new HTTPException(404, { message: "Instance not found" });
  }

  return c.json({});
});

serviceInstances.get("/:type/list", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const type = c.req.param("type");
  const table = tableFromType(type);
  const idName = idNameFromType(type);

  const instances = await c.env.DB.prepare(
    `SELECT ${idName}, name, created_at FROM ${table} WHERE user_id = ?`,
  )
    .bind(userId)
    .all<{ [idName]: string; name: string; created_at: number }>();

  return c.json(
    instances.results.map(({ [idName]: serviceId, name, created_at }) => ({
      serviceId,
      name,
      createdAt: created_at,
    })),
  );
});

export default serviceInstances;
