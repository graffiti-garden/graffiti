import { Hono } from "hono";
import { getOrigin, type Bindings } from "../../env";
import { HTTPException } from "hono/http-exception";
import { verifySessionCookie } from "../auth/session";
import {
  deriveRotationPublicKey,
  fetchActorCid,
  fetchActorData,
  generateRotationKeyPair,
  publishDid,
  withFirstWebHandle,
} from "./helpers";
import {
  identifierToDid,
  OptionalAlsoKnownAsSchema,
  OptionalServicesSchema,
} from "../../../shared/did-schemas";
import { base64url } from "multiformats/bases/base64";

const actorManagement = new Hono<{ Bindings: Bindings }>();

function checkReplacement(existing: { did: string } | null, replace: boolean) {
  if (existing && !replace) {
    throw new HTTPException(409, { message: "This account already has an actor." });
  }
  if (!existing && replace) {
    throw new HTTPException(409, { message: "Actor to replace not found." });
  }
}

async function checkActorAvailable(db: D1Database, did: string, userId: number) {
  const owner = await db.prepare(
    "SELECT 1 FROM actors WHERE did = ? AND user_id <> ?",
  ).bind(did, userId).first();
  if (owner) {
    throw new HTTPException(409, { message: "Another account already uses this actor." });
  }
}

async function accountHandleDid(db: D1Database, userId: number, host: string) {
  const handle = await db.prepare(
    "SELECT identifier FROM handles WHERE user_id = ?",
  ).bind(userId).first<{ identifier: string }>();
  if (!handle) {
    throw new HTTPException(409, { message: "This account has no handle." });
  }
  return identifierToDid(handle.identifier, host);
}

async function saveActor(
  db: D1Database,
  userId: number,
  did: string,
  secretKey: Uint8Array | null,
  replace: boolean,
) {
  const createdAt = Date.now();
  if (replace) {
    await db.prepare(
      "UPDATE actors SET did = ?, secret_key = ?, created_at = ? WHERE user_id = ?",
    ).bind(did, secretKey, createdAt, userId).run();
  } else {
    await db.prepare(
      "INSERT INTO actors (did, user_id, secret_key, created_at) VALUES (?, ?, ?, ?)",
    ).bind(did, userId, secretKey, createdAt).run();
  }
  return createdAt;
}

actorManagement.post("/create", async (c) => {
  const { userId } = await verifySessionCookie(c);
  // Check before publishing a DID to PLC. The database index also prevents
  // another actor from being stored if two requests arrive together.
  const existingActor = await c.env.DB.prepare(
    "SELECT did FROM actors WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ did: string }>();
  const body = await c.req.json();
  const replace = body.replace === true;
  checkReplacement(existingActor, replace);
  const services = OptionalServicesSchema.parse(body.services);
  const alsoKnownAs = withFirstWebHandle(
    OptionalAlsoKnownAsSchema.parse(body.alsoKnownAs) ?? [],
    await accountHandleDid(c.env.DB, userId, new URL(getOrigin(c)).host),
  );

  // Generate a key pair
  const { secretKey, rotationKey } = generateRotationKeyPair();

  // Construct and publish the DID
  const { did } = await publishDid({
    alsoKnownAs,
    services,
    oldSecretKey: secretKey,
    rotationKeys: [rotationKey],
  });

  // Keep one actor on the account while replacing its DID.
  const createdAt = await saveActor(c.env.DB, userId, did, secretKey, replace);

  return c.json({
    did,
    createdAt,
    rotationKey,
  });
});

actorManagement.put("/actor/:did", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const did = c.req.param("did");
  const body = await c.req.json();
  const services = OptionalServicesSchema.parse(body.services);
  const alsoKnownAs = withFirstWebHandle(
    OptionalAlsoKnownAsSchema.parse(body.alsoKnownAs) ?? [],
    await accountHandleDid(c.env.DB, userId, new URL(getOrigin(c)).host),
  );

  const dbResult = await c.env.DB.prepare(
    "SELECT secret_key FROM actors WHERE did = ? AND user_id = ?",
  )
    .bind(did, userId)
    .first<{ secret_key: number[] | null }>();
  if (!dbResult) {
    throw new HTTPException(404, {
      message: "Actor not found.",
    });
  }
  const { secret_key } = dbResult;
  if (!secret_key) {
    throw new HTTPException(409, { message: "This actor is managed elsewhere." });
  }
  const oldSecretKey = Uint8Array.from(secret_key);
  const data = await fetchActorData(did);
  const prev = await fetchActorCid(did);
  const rotationKey = deriveRotationPublicKey(oldSecretKey);
  if (!data.rotationKeys.includes(rotationKey)) {
    throw new HTTPException(409, { message: "This provider no longer controls the actor." });
  }

  // Editing aliases and services must not rotate or remove other keys.
  await publishDid({
    did,
    alsoKnownAs,
    services,
    oldSecretKey,
    verificationMethods: data.verificationMethods,
    rotationKeys: data.rotationKeys,
    prev,
  });

  return c.json({ rotationKey });
});

actorManagement.delete("/actor/:did/key", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const did = c.req.param("did");

  // Removing our copy of the key does not remove the actor from the account.
  const result = await c.env.DB.prepare(
    "UPDATE actors SET secret_key = NULL WHERE did = ? AND user_id = ? AND secret_key IS NOT NULL RETURNING did",
  )
    .bind(did, userId)
    .first();
  if (!result) {
    throw new HTTPException(404, { message: "Actor not found" });
  }

  return c.json({ removed: true });
});

actorManagement.get("/list", async (c) => {
  const { userId } = await verifySessionCookie(c);

  const result = await c.env.DB.prepare(
    "SELECT did, created_at, secret_key FROM actors WHERE user_id = ?",
  )
    .bind(userId)
    .all<{
      did: string;
      created_at: number;
      secret_key: number[] | null;
    }>();

  return c.json({
    actors: result.results.map((actor) => ({
      did: actor.did,
      createdAt: actor.created_at,
      rotationKey: actor.secret_key
        ? deriveRotationPublicKey(Uint8Array.from(actor.secret_key))
        : null,
    })),
  });
});

// export
actorManagement.get("/actor/:did", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const did = c.req.param("did");

  // Export the actor
  const result = await c.env.DB.prepare(
    "SELECT did, created_at, secret_key FROM actors WHERE did = ? AND user_id = ?",
  )
    .bind(did, userId)
    .first<{
      did: string;
      created_at: number;
      secret_key: number[] | null;
    }>();
  if (!result) {
    throw new HTTPException(404, { message: "Actor not found" });
  }
  if (!result.secret_key) {
    throw new HTTPException(409, { message: "This actor's key is managed elsewhere." });
  }

  // Return the exported actor
  return c.json({
    did: result.did,
    createdAt: result.created_at,
    secretKey: base64url.encode(Uint8Array.from(result.secret_key)),
  });
});

actorManagement.post("/import", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const body = await c.req.json();
  const replace = body.replace === true;
  // Check before changing PLC. The account's actor is replaced in one database update.
  const existingActor = await c.env.DB.prepare(
    "SELECT did, secret_key FROM actors WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ did: string; secret_key: number[] | null }>();
  checkReplacement(existingActor, replace);
  if (existingActor && existingActor.did === body.did && existingActor.secret_key) {
    throw new HTTPException(409, { message: "This account already manages that actor's key." });
  }
  const { did, secretKey } = body;
  if (typeof did !== "string" || !/^did:plc:[a-z2-7]{24}$/.test(did)) {
    throw new HTTPException(400, { message: "Enter a valid actor DID." });
  }
  await checkActorAvailable(c.env.DB, did, userId);
  const oldSecretKey = base64url.decode(secretKey);

  // Generate a new key pair
  const { secretKey: newSecretKey, rotationKey: newRotationKey } =
    generateRotationKeyPair();

  const data = await fetchActorData(did);
  // The export file may predate updates made by the other provider.
  const prev = await fetchActorCid(did);
  const previousRotationKey = deriveRotationPublicKey(oldSecretKey);
  if (!data.rotationKeys.includes(previousRotationKey)) {
    throw new HTTPException(409, { message: "The exported private key no longer controls this actor." });
  }

  const aliases = OptionalAlsoKnownAsSchema.parse(body.alsoKnownAs) ?? [];

  // Replace only the imported key. Keep the actor's other aliases, keys and
  // services while adding this account's handle.
  await publishDid({
    did,
    alsoKnownAs: withFirstWebHandle(
      [...new Set([...data.alsoKnownAs, ...aliases])],
      await accountHandleDid(c.env.DB, userId, new URL(getOrigin(c)).host),
    ),
    services: data.services,
    verificationMethods: data.verificationMethods,
    oldSecretKey,
    rotationKeys: data.rotationKeys.map((key) =>
      key === previousRotationKey ? newRotationKey : key
    ),
    prev,
  });

  // Import or replace the account's actor.
  const createdAt = await saveActor(c.env.DB, userId, did, newSecretKey, replace);

  // Return the imported actor
  return c.json({
    did,
    createdAt,
    rotationKey: newRotationKey,
  });
});

actorManagement.post("/attach", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const { did, replace } = await c.req.json();
  if (typeof did !== "string" || !/^did:plc:[a-z2-7]{24}$/.test(did)) {
    throw new HTTPException(400, { message: "Enter a valid actor DID." });
  }
  const existingActor = await c.env.DB.prepare(
    "SELECT did FROM actors WHERE user_id = ?",
  ).bind(userId).first<{ did: string }>();
  checkReplacement(existingActor, replace === true);
  await checkActorAvailable(c.env.DB, did, userId);
  const handleDid = await accountHandleDid(c.env.DB, userId, new URL(getOrigin(c)).host);
  const data = await fetchActorData(did);
  if (data.alsoKnownAs.find((alias) => alias.startsWith("did:web:")) !== handleDid) {
    throw new HTTPException(409, {
      message: `Make ${handleDid} the first did:web entry in the actor's alsoKnownAs before attaching it.`,
    });
  }
  const createdAt = await saveActor(c.env.DB, userId, did, null, replace === true);
  return c.json({ did, createdAt, rotationKey: null });
});

export default actorManagement;
