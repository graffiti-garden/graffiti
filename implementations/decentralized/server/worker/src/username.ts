import { Hono, type Context } from "hono";
import { createSession, verifySession } from "./session";

type Bindings = {
  DB: D1Database;
};

const router = new Hono<{ Bindings: Bindings }>();

router.get("/available/:username", async (c) => {
  const username = c.req.param("username").trim();

  const info = await c.env.DB.prepare(
    "SELECT * FROM usernames WHERE username = ?",
  )
    .bind(username)
    .first();

  return c.json({ available: !info });
});

router.post("/register", async (c) => {
  const username = c.req.query("username");

  if (!username) {
    return c.json({ error: "Missing username." }, 400);
  }

  const trimmed = username.trim();
  if (!trimmed) {
    return c.json({ error: "Invalid username." }, 400);
  }

  // See if the user is already logged in as the
  // user and double-registering
  let userId: string | undefined = undefined;
  try {
    userId = await verifySession(c);
  } catch (e) {
    // If the user has not logged in yet that is Ok.
  }

  // If already registered, return their existing username
  if (userId) {
    const result = await c.env.DB.prepare(
      "SELECT username FROM usernames WHERE user_id = ?",
    )
      .bind(userId)
      .first<{ username: string }>();

    if (result?.username === trimmed) {
      return c.json({ registered: true });
    }
  }

  // Otherwise, create a new user
  userId = crypto.randomUUID();
  const createdAt = Date.now();

  try {
    await c.env.DB.prepare(
      "INSERT INTO usernames (user_id, username, created_at) VALUES (?, ?, ?)",
    )
      .bind(userId, trimmed, createdAt)
      .run();
  } catch (error) {
    return c.json({ error: "Username already exists." }, 400);
  }

  // Create a session for the user
  await createSession(userId, c);
  return c.json({ registered: true });
});

router.get("/me", async (c) => {
  const userId = await verifySession(c);
  const result = await c.env.DB.prepare(
    "SELECT username FROM usernames WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ username: string }>();

  return c.json({ username: result?.username });
});

export default router;
