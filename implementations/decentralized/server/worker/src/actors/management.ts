import { Hono } from "hono";
import { z } from "zod";
import type { Bindings } from "../env";
import { HTTPException } from "hono/http-exception";
import { verifySessionCookie } from "../auth/session";
import { generateRotationKeyPair, publishDid } from "./helpers";
import {
  OptionalAlsoKnownAsSchema,
  OptionalServicesSchema,
} from "../../../shared/did-schemas";

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
    "INSERT INTO actors (did, user_id, secret_key, current_cid, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(did, userId, secretKey, cid, createdAt)
    .run();

  return c.json({
    did,
    createdAt,
    currentCid: cid,
  });
});

actorManagement.post("/update", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const body = await c.req.json();
  const did = body.did;
  const services = OptionalServicesSchema.parse(body.services);
  const alsoKnownAs = OptionalAlsoKnownAsSchema.parse(body.alsoKnownAs);

  const dbResult = await c.env.DB.prepare(
    "SELECT secret_key, current_cid FROM actors WHERE did = ? AND user_id = ?",
  )
    .bind(did, userId)
    .first<{ secret_key: Uint8Array; current_cid: string }>();
  if (!dbResult) {
    throw new HTTPException(404, {
      message: "Actor not found.",
    });
  }
  const { secret_key: oldSecretKey, current_cid: prev } = dbResult;

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
    "UPDATE actors SET secret_key = ?, current_cid = ? WHERE did = ? AND user_id = ?",
  )
    .bind(newSecretKey, cid, did, userId)
    .run();

  // Return the updated actor DID
  return c.json({
    did,
    currentCid: cid,
  });
});

actorManagement.post("/delete", async (c) => {
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

  return c.json({ deleted: true });
});

actorManagement.get("/list", async (c) => {
  const { userId } = await verifySessionCookie(c);

  const result = await c.env.DB.prepare(
    "SELECT did, created_at, current_cid FROM actors WHERE user_id = ?",
  )
    .bind(userId)
    .all<{ did: string; current_cid: string; created_at: number }>();

  return c.json({
    actors: result.results.map((actor) => ({
      did: actor.did,
      createdAt: actor.created_at,
      currentCid: actor.current_cid,
    })),
  });
});

actorManagement.post("/export", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const body = await c.req.json();
  const { did } = body.data;

  // Export the actor
  const result = await c.env.DB.prepare(
    "SELECT * FROM actors WHERE did = ? AND user_id = ?",
  )
    .bind(did, userId)
    .first<{
      did: string;
      current_cid: string;
      created_at: number;
      secret_key: string;
    }>();
  if (!result) {
    throw new HTTPException(404, { message: "Actor not found" });
  }

  // Return the exported actor
  return c.json({
    did: result.did,
    currentCid: result.current_cid,
    createdAt: result.created_at,
    secretKey: result.secret_key,
  });
});

export default actorManagement;
