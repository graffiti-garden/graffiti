import { Hono } from "hono";
import type { Bindings } from "../env";
import { verifySessionCookie } from "../auth/session";
import { randomBase64 } from "../auth/utils";
import { HTTPException } from "hono/http-exception";

const storageInstances = new Hono<{ Bindings: Bindings }>();

storageInstances.post("/create", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const name = c.req.query("name");
  if (!name) {
    throw new HTTPException(400, { message: "Missing name" });
  }

  const id = randomBase64();
  const createdAt = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO storage_instances (id, name, user_id, created_at) VALUES (?, ?, ?, ?)`,
  )
    .bind(id, name, userId, createdAt)
    .run();

  return c.json({ id, createdAt });
});

storageInstances.put("/rename", async (c) => {
  const { userId } = await verifySessionCookie(c);

  const id = c.req.query("id");
  const name = c.req.query("name");
  if (!id || !name) {
    throw new HTTPException(400, { message: "Missing id or name" });
  }

  const result = await c.env.DB.prepare(
    `UPDATE storage_instances SET name = ? WHERE id = ? AND user_id = ? RETURNING id`,
  )
    .bind(name, id, userId)
    .first<{ id: string }>();
  if (!result) {
    throw new HTTPException(404, { message: "Instance not found" });
  }
  return c.json({});
});

storageInstances.delete("/delete", async (c) => {
  const { userId } = await verifySessionCookie(c);

  const id = c.req.query("id");
  if (!id) {
    throw new HTTPException(400, { message: "Missing id" });
  }

  const result = await c.env.DB.prepare(
    `DELETE FROM storage_instances WHERE id = ? AND user_id = ? RETURNING id`,
  )
    .bind(id, userId)
    .first<{ id: string }>();

  // TODO: Delete associated storage items

  if (!result) {
    throw new HTTPException(404, { message: "Instance not found" });
  }

  return c.json({});
});

storageInstances.get("/list", async (c) => {
  const { userId } = await verifySessionCookie(c);

  const instances = await c.env.DB.prepare(
    `SELECT id, name, created_at FROM storage_instances WHERE user_id = ?`,
  )
    .bind(userId)
    .all<{ id: string; name: string; created_at: number }>();

  return c.json(
    instances.results.map(({ id, name, created_at }) => ({
      id,
      name,
      createdAt: created_at,
    })),
  );
});

export default storageInstances;
