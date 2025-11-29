import { Hono, type Context } from "hono";
import type { Bindings } from "./env";
import { verifySessionCookie } from "./auth/session";
import { HTTPException } from "hono/http-exception";

const router = new Hono<{ Bindings: Bindings }>();

router.get("/available/:actor", async (c) => {
  const actor = c.req.param("actor");

  const info = await c.env.DB.prepare("SELECT * FROM actors WHERE actor = ?")
    .bind(actor)
    .first();

  return c.json({ available: !info });
});

router.post("/register", async (c) => {
  const { userId } = await verifySessionCookie(c);

  const actor = c.req.query("actor");

  // Attempt to store the actor
  try {
    await c.env.DB.prepare(
      "INSERT INTO actors (user_id, actor, created_at) VALUES (?, ?, ?)",
    )
      .bind(userId, actor, Date.now())
      .run();
  } catch (error: any) {
    const msg = String(error?.message || "");
    if (msg.includes("max_actors_reached")) {
      return c.text("You have reached the maximum number of actors.", 400);
    } else if (msg.includes("UNIQUE")) {
      return c.text("Actor already exists.", 400);
    } else if (msg.includes("CHECK")) {
      return c.text("Actor is invalid.", 400);
    }
    return c.text("Unknown error.", 500);
  }

  return c.json({ registered: true });
});

router.get("/list", async (c) => {
  const userId = await verifySessionCookie(c);
  const result = await c.env.DB.prepare(
    "SELECT actor FROM actors WHERE user_id = ?",
  )
    .bind(userId)
    .all<{ actor: string; created_at: number }>();

  return c.json({ actors: result.results });
});

export default router;
