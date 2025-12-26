import { Hono } from "hono";
import type { Bindings } from "../env";
import { verifySessionCookie } from "../auth/session";
import { randomBase64 } from "../auth/utils";
import { HTTPException } from "hono/http-exception";

const serviceInstances = new Hono<{ Bindings: Bindings }>();

serviceInstances.post("/create", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const { name, type } = await c.req.json();

  const serviceId = randomBase64();
  const createdAt = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO service_instances (service_id, type, name, user_id, created_at) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(serviceId, type, name, userId, createdAt)
    .run();

  return c.json({ serviceId, createdAt });
});

serviceInstances.put("/service/:service-id", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const serviceId = c.req.param("service-id");
  const { name } = await c.req.json();

  const result = await c.env.DB.prepare(
    `UPDATE service_instances SET name = ? WHERE service_id = ? AND user_id = ? RETURNING service_id`,
  )
    .bind(name, serviceId, userId)
    .first();
  if (!result) {
    throw new HTTPException(404, { message: "Instance not found" });
  }
  return c.json({});
});

serviceInstances.delete("/service/:service-id", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const serviceId = c.req.param("service-id");

  const result = await c.env.DB.prepare(
    `DELETE FROM service_instances WHERE service_id = ? AND user_id = ? RETURNING service_id`,
  )
    .bind(serviceId, userId)
    .first<{ id: string }>();

  // TODO: Delete all associated items in bucket/indexer

  if (!result) {
    throw new HTTPException(404, { message: "Instance not found" });
  }

  return c.json({});
});

serviceInstances.get("/list/:type", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const type = c.req.param("type");

  const instances = await c.env.DB.prepare(
    `SELECT service_id, name, created_at FROM service_instances WHERE user_id = ? AND type = ?`,
  )
    .bind(userId, type)
    .all<{ service_id: string; name: string; created_at: number }>();

  return c.json(
    instances.results.map(({ service_id, name, created_at }) => ({
      serviceId: service_id,
      name,
      createdAt: created_at,
    })),
  );
});

export default serviceInstances;
