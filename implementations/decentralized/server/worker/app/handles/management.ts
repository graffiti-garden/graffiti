import { Hono } from "hono";
import type { Bindings } from "../../env";
import { verifySessionCookie, verifyTempSessionCookie } from "../auth/session";
import { HTTPException } from "hono/http-exception";
import {
  OptionalAlsoKnownAsSchema,
  OptionalServicesSchema,
} from "../../../shared/did-schemas";
import { getDid } from "./dids";
import { isHandleAvailable, prepareHandleInsertFromName } from "./registration";

const router = new Hono<{ Bindings: Bindings }>();

router.get("/available/:handle-name", async (c) => {
  const handleName = c.req.param("handle-name");
  let sessionId = -1;
  try {
    sessionId = (await verifyTempSessionCookie(c)).sessionId;
  } catch (error) {
    if (!(error instanceof HTTPException && error.status === 401)) throw error;
  }
  return c.json({
    available: await isHandleAvailable(c.env.DB, handleName, sessionId),
  });
});

router.post("/register", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const body = await c.req.json();
  const handleName = body.name;
  const services = OptionalServicesSchema.parse(body.services);
  const alsoKnownAs = OptionalAlsoKnownAsSchema.parse(body.alsoKnownAs);

  // Attempt to store the handle
  try {
    const insert = prepareHandleInsertFromName(c.env.DB, userId, handleName, {
      services: services ? JSON.stringify(services) : null,
      alsoKnownAs: alsoKnownAs ? JSON.stringify(alsoKnownAs) : null,
    });
    const result = await insert.run();
    if (!result.meta.changes) {
      throw new HTTPException(409, { message: "Handle is being registered." });
    }
  } catch (error: any) {
    if (error instanceof HTTPException) throw error;
    const msg = String(error?.message || "");
    if (msg.includes("handles.user_id")) {
      throw new HTTPException(409, {
        message:
          "This account already has a handle. Log out to create another account.",
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

// Unregister
router.delete("/handle/:handle-name", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const handleName = c.req.param("handle-name");

  const result = await c.env.DB.prepare(
    "DELETE FROM handles WHERE name = ? AND user_id = ? RETURNING name",
  )
    .bind(handleName, userId)
    .first();
  if (!result) {
    throw new HTTPException(404, { message: "Handle not found." });
  }
  return c.json({ deleted: true });
});

router.put("/handle/:handle-name", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const handleName = c.req.param("handle-name");
  const body = await c.req.json();
  const services = OptionalServicesSchema.parse(body.services);
  const alsoKnownAs = OptionalAlsoKnownAsSchema.parse(body.alsoKnownAs);

  // Attempt to update the handle
  const result = await c.env.DB.prepare(
    "UPDATE handles SET services = ?, also_known_as = ? WHERE name = ? AND user_id = ? RETURNING name",
  )
    .bind(
      services ? JSON.stringify(services) : null,
      alsoKnownAs ? JSON.stringify(alsoKnownAs) : null,
      handleName,
      userId,
    )
    .first();
  if (!result) {
    throw new HTTPException(404, { message: "Handle not found." });
  }

  return c.json({ updated: true });
});

router.get("/handle/:handle-name/did.json", getDid);

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
