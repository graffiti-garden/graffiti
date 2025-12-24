import { Hono } from "hono";
import { z } from "zod";
import type { Bindings } from "../env";
import { HTTPException } from "hono/http-exception";
import { verifySessionCookie } from "../auth/session";
import {
  deriveRotationPublicKey,
  generateRotationKeyPair,
  publishDid,
} from "./helpers";
import {
  OptionalAlsoKnownAsSchema,
  OptionalServicesSchema,
} from "../../../shared/did-schemas";
import { base64url } from "multiformats/bases/base64";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const actorManagement = new Hono<{ Bindings: Bindings }>();

actorManagement.post("/create", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const body = await c.req.json();
  const services = OptionalServicesSchema.parse(body.services);
  const alsoKnownAs = OptionalAlsoKnownAsSchema.parse(body.alsoKnownAs);

  // Generate a key pair
  const { secretKey, rotationKey } = generateRotationKeyPair();

  // Construct and publish the DID
  const { cid, did } = await publishDid({
    alsoKnownAs,
    services,
    oldSecretKey: secretKey,
    newRotationKey: rotationKey,
  });

  // Store the secret key in the database
  const createdAt = Date.now();
  await c.env.DB.prepare(
    "INSERT INTO actors (did, user_id, secret_key, cid, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(did, userId, secretKey, cid, createdAt)
    .run();

  return c.json({
    did,
    createdAt,
    rotationKey,
  });
});

actorManagement.post("/update", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const body = await c.req.json();
  const did = body.did;
  const services = OptionalServicesSchema.parse(body.services);
  const alsoKnownAs = OptionalAlsoKnownAsSchema.parse(body.alsoKnownAs);

  const dbResult = await c.env.DB.prepare(
    "SELECT secret_key, cid FROM actors WHERE did = ? AND user_id = ?",
  )
    .bind(did, userId)
    .first<{ secret_key: number[]; cid: string }>();
  if (!dbResult) {
    throw new HTTPException(404, {
      message: "Actor not found.",
    });
  }
  const { secret_key, cid: prev } = dbResult;
  const oldSecretKey = Uint8Array.from(secret_key);

  const { secretKey: newSecretKey, rotationKey: newRotationKey } =
    generateRotationKeyPair();

  // Construct and publish the DID
  const { cid } = await publishDid({
    did,
    alsoKnownAs,
    services,
    oldSecretKey,
    newRotationKey,
    prev,
  });

  // Update the new secret key and cid
  await c.env.DB.prepare(
    "UPDATE actors SET secret_key = ?, cid = ? WHERE did = ? AND user_id = ?",
  )
    .bind(newSecretKey, cid, did, userId)
    .run();

  return c.json({ rotationKey: newRotationKey });
});

actorManagement.post("/remove", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const body = await c.req.json();
  const did = body.did;

  // Delete the actor
  const result = await c.env.DB.prepare(
    "DELETE FROM actors WHERE did = ? AND user_id = ? RETURNING did",
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
      secret_key: number[];
    }>();

  return c.json({
    actors: result.results.map((actor) => ({
      did: actor.did,
      createdAt: actor.created_at,
      rotationKey: deriveRotationPublicKey(Uint8Array.from(actor.secret_key)),
    })),
  });
});

actorManagement.post("/export", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const body = await c.req.json();
  const { did } = body;

  // Export the actor
  const result = await c.env.DB.prepare(
    "SELECT * FROM actors WHERE did = ? AND user_id = ?",
  )
    .bind(did, userId)
    .first<{
      did: string;
      cid: string;
      created_at: number;
      secret_key: number[];
    }>();
  if (!result) {
    throw new HTTPException(404, { message: "Actor not found" });
  }

  // Return the exported actor
  return c.json({
    did: result.did,
    cid: result.cid,
    createdAt: result.created_at,
    secretKey: base64url.encode(Uint8Array.from(result.secret_key)),
  });
});

actorManagement.post("/import", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const body = await c.req.json();
  const { did, cid: prev, secretKey } = body;
  console.log(body);
  const oldSecretKey = base64url.decode(secretKey);

  // Generate a new key pair
  const { secretKey: newSecretKey, rotationKey: newRotationKey } =
    generateRotationKeyPair();

  // Get the existing data
  const result = await fetch(`https://plc.directory/${did}/data`);
  if (!result.ok) {
    const { message } = (await result.json()) as { message: string };
    throw new HTTPException((result.status ?? 500) as ContentfulStatusCode, {
      message,
    });
  }
  const json = (await result.json()) as any;
  const alsoKnownAs = OptionalAlsoKnownAsSchema.parse(json.alsoKnownAs);
  const services = OptionalServicesSchema.parse(json.services);

  // Construct and publish the DID
  const { cid } = await publishDid({
    did,
    alsoKnownAs,
    services,
    oldSecretKey,
    newRotationKey,
    prev,
  });

  // Import the actor
  const createdAt = Date.now();
  await c.env.DB.prepare(
    "INSERT INTO actors (did, cid, created_at, secret_key, user_id) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(did, cid, createdAt, Uint8Array.from(newSecretKey), userId)
    .run();

  // Return the imported actor
  return c.json({
    did,
    createdAt,
    rotationKey: newRotationKey,
  });
});

export default actorManagement;
