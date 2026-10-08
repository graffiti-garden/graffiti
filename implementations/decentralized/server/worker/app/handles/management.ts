import { Hono, type Context } from "hono";
import { getOrigin, type Bindings } from "../../env";
import { verifySessionCookie, verifyTempSessionCookie } from "../auth/session";
import { HTTPException } from "hono/http-exception";
import { didWebToUrl, identifierToDid } from "../../../shared/did-schemas";
import { getDid } from "./dids";
import {
  isHandleAvailable,
  prepareHandleReplacement,
  reserveHandle,
} from "./registration";
import { publishActorHandle, type Actor } from "../actors/helpers";

const router = new Hono<{ Bindings: Bindings }>();

// Check the published document before offering to replace the account's handle.
// The change endpoint checks it again because the document can change meanwhile.
async function verifyExternalHandle(
  c: Context<{ Bindings: Bindings }>,
  did: string,
  actorDid: string,
) {
  let url: string;
  try {
    url = didWebToUrl(did);
  } catch {
    throw new HTTPException(400, { message: "Invalid custom domain." });
  }
  const host = new URL(url).hostname;
  if (host === c.env.BASE_HOST || host.endsWith(`.${c.env.BASE_HOST}`)) {
    throw new HTTPException(400, {
      message: `Choose a .${c.env.BASE_HOST} handle instead.`,
    });
  }
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new HTTPException(400, { message: "Could not read the domain's did.json file." });
  }
  if (!response.ok) {
    throw new HTTPException(400, { message: "Could not read the domain's did.json file." });
  }
  let document: Record<string, unknown> | null;
  try {
    document = await response.json();
  } catch {
    throw new HTTPException(400, { message: "The domain's did.json file is not valid JSON." });
  }
  if (
    !document ||
    document.id !== did ||
    !Array.isArray(document.alsoKnownAs) ||
    !document.alsoKnownAs.includes(actorDid)
  ) {
    throw new HTTPException(400, {
      message: "The domain's did.json file must point to this account's actor.",
    });
  }
}

router.get("/available/:local-name", async (c) => {
  const localName = c.req.param("local-name");
  let sessionId = -1;
  try {
    sessionId = (await verifyTempSessionCookie(c)).sessionId;
  } catch (error) {
    if (!(error instanceof HTTPException && error.status === 401)) throw error;
  }
  return c.json({
    available: await isHandleAvailable(c.env.DB, localName, sessionId),
  });
});

router.post("/verify-external", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const { did } = await c.req.json();
  if (typeof did !== "string" || !did.startsWith("did:web:")) {
    throw new HTTPException(400, { message: "Custom domain is required." });
  }
  const actor = await c.env.DB.prepare(
    "SELECT did FROM actors WHERE user_id = ?",
  ).bind(userId).first<{ did: string }>();
  if (!actor) {
    throw new HTTPException(409, { message: "Create an actor before using an external handle." });
  }
  await verifyExternalHandle(c, did, actor.did);
  return c.json({ verified: true });
});

// Replace a local handle or register an external DID. The actor's
// alsoKnownAs is updated first so the new handle and actor point to each other.
router.post("/change", async (c) => {
  const { userId, sessionId } = await verifySessionCookie(c);
  const { identifier } = await c.req.json();
  if (typeof identifier !== "string") {
    throw new HTTPException(400, { message: "Handle is required." });
  }
  const external = identifier.startsWith("did:web:");
  const previous = await c.env.DB.prepare(
    "SELECT identifier FROM handles WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ identifier: string }>();
  if (previous?.identifier === identifier) return c.json({ updated: true });

  const actor = await c.env.DB.prepare(
    "SELECT did, secret_key, cid FROM actors WHERE user_id = ?",
  )
    .bind(userId)
    .first<Actor>();
  const did = identifierToDid(identifier, new URL(getOrigin(c)).host);

  if (external) {
    if (!actor) {
      throw new HTTPException(409, { message: "Create an actor before using an external handle." });
    }
    // The document may point to multiple actors, but this provider stores each
    // handle only once. Check before publishing the actor's PLC update.
    const occupied = await c.env.DB.prepare(
      "SELECT 1 FROM handles WHERE identifier = ? AND user_id <> ?",
    ).bind(identifier, userId).first();
    if (occupied) {
      throw new HTTPException(409, {
        message: "Another account on this provider already uses this handle.",
      });
    }
    await verifyExternalHandle(c, did, actor.did);
  } else {
    await reserveHandle(c.env.DB, identifier, sessionId);
  }

  try {
    const updateHandle = prepareHandleReplacement(
      c.env.DB,
      userId,
      identifier,
      sessionId,
    );

    if (actor) {
      const { cid } = await publishActorHandle(actor, did);
      await c.env.DB.batch([
        updateHandle,
        c.env.DB.prepare("UPDATE actors SET cid = ? WHERE user_id = ?")
          .bind(cid, userId),
      ]);
    } else {
      await updateHandle.run();
    }
  } catch (error) {
    if (String(error).includes("NOT NULL constraint failed: handles.identifier")) {
      throw new HTTPException(409, { message: "Handle reservation expired. Please try again." });
    }
    if (String(error).includes("UNIQUE constraint failed: handles.identifier")) {
      throw new HTTPException(409, { message: "Another account on this provider already uses this handle." });
    }
    throw error;
  } finally {
    if (!external) {
      await c.env.DB.prepare(
        "DELETE FROM handle_reservations WHERE name = ? AND session_id = ?",
      ).bind(identifier, sessionId).run();
    }
  }
  return c.json({ updated: true });
});

router.get("/handle/:local-name/did.json", getDid);

router.get("/list", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const result = await c.env.DB.prepare(
    "SELECT identifier, created_at FROM handles WHERE user_id = ?",
  )
    .bind(userId)
    .all<{
      identifier: string;
      created_at: number;
    }>();

  // Convert the data to a JSON object
  const handles = result.results.map((row) => {
    return {
      identifier: row.identifier,
      createdAt: row.created_at,
    };
  });

  return c.json({ handles });
});

export default router;
