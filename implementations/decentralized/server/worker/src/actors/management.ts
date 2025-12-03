import { Hono, type Context } from "hono";
import type { Bindings } from "../env";
import { verifySessionCookie } from "../auth/session";
import { HTTPException } from "hono/http-exception";

const router = new Hono<{ Bindings: Bindings }>();

router.get("/available/:actor", async (c) => {
  const actor = c.req.param("actor");

  const info = await c.env.DB.prepare(
    "SELECT created_at FROM actors WHERE actor = ?",
  )
    .bind(actor)
    .first();

  return c.json({ available: !info });
});

router.post("/register/:actor", async (c) => {
  const { userId } = await verifySessionCookie(c);

  const actor = c.req.param("actor");

  // Attempt to store the actor
  try {
    await c.env.DB.prepare(
      "INSERT INTO actors (user_id, actor, created_at, data) VALUES (?, ?, ?, ?)",
    )
      .bind(userId, actor, Date.now(), "{}")
      .run();
  } catch (error: any) {
    const msg = String(error?.message || "");
    if (msg.includes("max_actors_reached")) {
      throw new HTTPException(400, {
        message: "You have reached the maximum number of actors.",
      });
    } else if (msg.includes("UNIQUE")) {
      throw new HTTPException(400, { message: "Actor already exists." });
    } else if (msg.includes("CHECK")) {
      throw new HTTPException(400, { message: "Actor is invalid." });
    }
    return c.text("Unknown error.", 500);
  }

  return c.json({ registered: true });
});

router.put("/update/:actor", async (c) => {
  const { userId } = await verifySessionCookie(c);

  const actor = c.req.param("actor");
  const data = c.req.query("data");

  // Ensure that the data is a JSON object
  // matching the Actor schema

  // Attempt to update the actor
  const result = await c.env.DB.prepare(
    "UPDATE actors SET data = ? WHERE user_id = ? AND actor = ?",
  )
    .bind(data, userId, actor)
    .first();
  if (!result) {
    throw new HTTPException(404, { message: "Actor not found." });
  }

  return c.json({ updated: true });
});

router.get("/list", async (c) => {
  const userId = await verifySessionCookie(c);
  const result = await c.env.DB.prepare(
    "SELECT actor, created_at, data FROM actors WHERE user_id = ?",
  )
    .bind(userId)
    .all<{ actor: string; created_at: number; data: string }>();

  // Convert the data to a JSON object
  const actors = result.results.map((actor) => {
    let parsedData;
    try {
      parsedData = JSON.parse(actor.data);
    } catch {
      parsedData = null;
    }
    return {
      actor: actor.actor,
      created_at: actor.created_at,
      data: parsedData,
    };
  });

  return c.json({ actors });
});

export default router;
