import { Hono, type Context } from "hono";
import type { Bindings } from "../env";
import { verifySessionCookie } from "../auth/session";
import { HTTPException } from "hono/http-exception";
import { HandleSchema, HandleBodySchema, HandleUpdateSchema } from "./schemas";

const router = new Hono<{ Bindings: Bindings }>();

router.get("/available/:handle", async (c) => {
  const handle = c.req.param("handle");
  const parseResult = HandleSchema.safeParse(handle);
  if (!parseResult.success) {
    throw new HTTPException(400, {
      message: "Invalid handle.",
      cause: parseResult.error.flatten(),
    });
  }

  const info = await c.env.DB.prepare(
    "SELECT created_at FROM handles WHERE handle = ?",
  )
    .bind(handle)
    .first();

  return c.json({ available: !info });
});

router.post("/register", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const json = await c.req.json();
  const parseResult = HandleUpdateSchema.safeParse(json);
  if (!parseResult.success) {
    throw new HTTPException(400, {
      message: "Invalid request body.",
      cause: parseResult.error.flatten(),
    });
  }
  const { handle, data } = parseResult.data;

  // Attempt to store the handle
  try {
    await c.env.DB.prepare(
      "INSERT INTO handles (user_id, handle, created_at, data) VALUES (?, ?, ?, ?)",
    )
      .bind(userId, handle, Date.now(), JSON.stringify(data))
      .run();
  } catch (error: any) {
    const msg = String(error?.message || "");
    if (msg.includes("max_handles_reached")) {
      throw new HTTPException(400, {
        message: "You have reached the maximum number of handles.",
      });
    } else if (msg.includes("UNIQUE")) {
      throw new HTTPException(400, { message: "handle already exists." });
    } else if (msg.includes("CHECK")) {
      throw new HTTPException(400, { message: "handle is invalid." });
    }
    return c.text("Unknown error.", 500);
  }

  return c.json({ registered: true });
});

router.post("/delete", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const json = await c.req.json();
  const parseResult = HandleBodySchema.safeParse(json);
  if (!parseResult.success) {
    throw new HTTPException(400, {
      message: "Invalid request body.",
      cause: parseResult.error.flatten(),
    });
  }
  const { handle } = parseResult.data;
  const result = await c.env.DB.prepare(
    "DELETE FROM handles WHERE user_id = ? AND handle = ?",
  )
    .bind(userId, handle)
    .first();
  if (!result) {
    throw new HTTPException(404, { message: "Handle not found." });
  }
  return c.json({ deleted: true });
});

router.post("/update", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const json = await c.req.json();
  const parseResult = HandleUpdateSchema.safeParse(json);
  if (!parseResult.success) {
    throw new HTTPException(400, {
      message: "Invalid request body.",
      cause: parseResult.error.flatten(),
    });
  }
  const { handle, data } = parseResult.data;

  // Attempt to update the handle
  const result = await c.env.DB.prepare(
    "UPDATE handles SET data = ? WHERE user_id = ? AND handle = ?",
  )
    .bind(data, userId, handle)
    .first();
  if (!result) {
    throw new HTTPException(404, { message: "handle not found." });
  }

  return c.json({ updated: true });
});

router.get("/list", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const result = await c.env.DB.prepare(
    "SELECT handle, created_at, data FROM handles WHERE user_id = ?",
  )
    .bind(userId)
    .all<{ handle: string; created_at: number; data: string }>();

  // Convert the data to a JSON object
  const handles = result.results.map((handle) => {
    let parsedData;
    try {
      parsedData = JSON.parse(handle.data);
    } catch (error) {
      parsedData = null;
    }
    return {
      handle: handle.handle,
      created_at: handle.created_at,
      data: parsedData,
    };
  });

  return c.json({ handles });
});

export default router;
