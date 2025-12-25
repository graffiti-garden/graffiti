import { Hono, type Context } from "hono";
import type { Bindings } from "../env";
import { verifySessionCookie } from "../auth/session";
import { HTTPException } from "hono/http-exception";
import {
  OptionalAlsoKnownAsSchema,
  OptionalServicesSchema,
} from "../../../shared/did-schemas";

const router = new Hono<{ Bindings: Bindings }>();

router.get("/available/:handle-name", async (c) => {
  const handleName = c.req.param("handle-name");
  const info = await c.env.DB.prepare(
    "SELECT created_at FROM handles WHERE name = ?",
  )
    .bind(handleName)
    .first();

  return c.json({ available: !info });
});

router.post("/register", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const body = await c.req.json();
  const handleName = body.name;
  const services = OptionalServicesSchema.parse(body.services);
  const alsoKnownAs = OptionalAlsoKnownAsSchema.parse(body.alsoKnownAs);

  // Attempt to store the handle
  try {
    await c.env.DB.prepare(
      "INSERT INTO handles (user_id, name, created_at, services, also_known_as) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(
        userId,
        handleName,
        Date.now(),
        services ? JSON.stringify(services) : null,
        alsoKnownAs ? JSON.stringify(alsoKnownAs) : null,
      )
      .run();
  } catch (error: any) {
    const msg = String(error?.message || "");
    if (msg.includes("max_handles_reached")) {
      throw new HTTPException(400, {
        message: "You have reached the maximum number of handles.",
      });
    } else if (msg.includes("UNIQUE")) {
      throw new HTTPException(400, { message: "Handle already exists." });
    } else if (msg.includes("CHECK")) {
      throw new HTTPException(400, { message: "Handle is invalid." });
    }
    console.log(error);
    return c.text("Unknown error.", 500);
  }

  return c.json({ registered: true });
});

router.post("/delete", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const { name: handleName } = await c.req.json();

  const result = await c.env.DB.prepare(
    "DELETE FROM handles WHERE user_id = ? AND name = ? RETURNING name",
  )
    .bind(userId, handleName)
    .first();
  if (!result) {
    throw new HTTPException(404, { message: "Handle not found." });
  }
  return c.json({ deleted: true });
});

router.post("/update", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const body = await c.req.json();
  const handleName = body.name;
  const services = OptionalServicesSchema.parse(body.services);
  const alsoKnownAs = OptionalAlsoKnownAsSchema.parse(body.alsoKnownAs);

  // Attempt to update the handle
  const result = await c.env.DB.prepare(
    "UPDATE handles SET services = ?, also_known_as = ? WHERE user_id = ? AND name = ? RETURNING name",
  )
    .bind(
      services ? JSON.stringify(services) : null,
      alsoKnownAs ? JSON.stringify(alsoKnownAs) : null,
      userId,
      handleName,
    )
    .first();
  if (!result) {
    throw new HTTPException(404, { message: "Handle not found." });
  }

  return c.json({ updated: true });
});

router.get("/list", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const result = await c.env.DB.prepare(
    "SELECT name, created_at, services, also_known_as FROM handles WHERE user_id = ?",
  )
    .bind(userId)
    .all<{
      name: string;
      created_at: number;
      services: string | null;
      also_known_as: string | null;
    }>();

  // Convert the data to a JSON object
  const handles = result.results.map((handle) => {
    return {
      name: handle.name,
      createdAt: handle.created_at,
      services: OptionalServicesSchema.parse(
        handle.services ? JSON.parse(handle.services) : undefined,
      ),
      alsoKnownAs: OptionalAlsoKnownAsSchema.parse(
        handle.also_known_as ? JSON.parse(handle.also_known_as) : undefined,
      ),
    };
  });

  return c.json({ handles });
});

export default router;
