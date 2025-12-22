import { Hono } from "hono";
import { z } from "zod";
import type { Bindings } from "../env";
import { HTTPException } from "hono/http-exception";
import { verifySessionCookie } from "../auth/session";
import {
  deriveCid,
  deriveDid,
  generateRotationKeyPair,
  signOperation,
} from "./helpers";

const actorManagement = new Hono<{ Bindings: Bindings }>();

const AlsoKnownAsSchema = z.array(z.string().url());
const ServicesSchema = z.record(
  z.string(),
  z.object({
    type: z.string(),
    endpoint: z.string().url(),
  }),
);
const CreateBodySchema = z.object({
  alsoKnownAs: AlsoKnownAsSchema,
  services: ServicesSchema,
});
const UpdateBodySchema = z.object({
  did: z.string(),
  alsoKnownAs: AlsoKnownAsSchema,
  services: ServicesSchema,
});

actorManagement.post("/create", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const json = await c.req.json();
  const parseResult = CreateBodySchema.safeParse(json);
  if (!parseResult.success) {
    throw new HTTPException(400, {
      message: JSON.stringify(parseResult.error.flatten()),
    });
  }
  const { alsoKnownAs, services } = parseResult.data;

  // Generate a key pair
  const { secretKey, rotationKey } = generateRotationKeyPair();

  // Construct the operation
  const unsignedOperation = {
    type: "plc_operation",
    rotationKeys: [rotationKey],
    verificationMethods: {
      atproto: rotationKey,
    },
    alsoKnownAs,
    services,
    prev: null,
  };

  // Sign it
  const signedOperation = await signOperation(unsignedOperation, secretKey);

  // Derive the DID from it
  const did = await deriveDid(signedOperation);
  const cid = await deriveCid(signedOperation);

  // Publish the DID to the directory
  const result = await fetch(`https://plc.directory/${did}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(signedOperation),
  });
  if (!result.ok) {
    const { message } = (await result.json()) as { message: string };
    throw new HTTPException(500, { message });
  }

  // Store the secret key in the database
  await c.env.DB.prepare(
    "INSERT INTO actors (did, user_id, secret_key, current_cid, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(did, userId, secretKey, cid, Date.now())
    .run();

  return c.json({ did });
});

actorManagement.post("/update", async (c) => {
  const { userId } = await verifySessionCookie(c);
  const json = await c.req.json();
  const parseResult = UpdateBodySchema.safeParse(json);
  if (!parseResult.success) {
    throw new HTTPException(400, {
      message: JSON.stringify(parseResult.error.flatten()),
    });
  }
  const { did, alsoKnownAs, services } = parseResult.data;

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

  // Generate a new secret key
  const { secretKey, rotationKey } = generateRotationKeyPair();

  // Create a new operation
  const unsignedOperation = {
    type: "plc_operation",
    rotationKeys: [rotationKey],
    verificationMethods: {},
    alsoKnownAs,
    services,
    prev,
  };

  // Sign that operation
  const signedOperation = await signOperation(unsignedOperation, oldSecretKey);
  const cid = await deriveCid(signedOperation);

  // Publish the new operation
  const result = await fetch(`https://plc.directory/${did}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(signedOperation),
  });
  if (!result.ok) {
    const { message } = (await result.json()) as { message: string };
    throw new HTTPException(500, { message });
  }

  // Update the new secret key and cid
  await c.env.DB.prepare(
    "UPDATE actors SET secret_key = ?, current_cid = ? WHERE did = ? AND user_id = ?",
  )
    .bind(secretKey, cid, did, userId)
    .run();

  // Return the updated actor DID
  return c.json({ updated: true });
});

// delete() {
// }

// // Update

// export() {
//   // Downloads recovery keys
// }

// import() {
//   // Uploads a new actor
// }

export default actorManagement;
