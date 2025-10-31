import { Hono } from "hono";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type VerifiedRegistrationResponse,
} from "@simplewebauthn/server";
import { verifySession } from "./session";

type Bindings = {
  DB: D1Database;
};

const router = new Hono<{ Bindings: Bindings }>();

const rpName = "Graffiti App";
const rpID = "localhost";
const origin = "http://localhost:5173";

router.get("/register/challenge", async (c) => {
  const userId = await verifySession(c);
  const result = await c.env.DB.prepare(
    `SELECT username FROM usernames WHERE user_id = ?`,
  )
    .bind(userId)
    .first<{ username: string }>();

  if (!result) {
    return c.json({ error: "User not found." }, 404);
  }

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    attestationType: "none",
    userName: result.username,
    userID: userId,
  });

  // store the challenge with the userId
  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO registration_options (user_id, challenge) VALUES (?, ?)`,
  )
    .bind(userId, options.challenge)
    .run();

  return c.json(options);
});

router.post("/register/verify", async (c) => {
  const userId = await verifySession(c);

  const response = await c.req.json();

  // Fetch the challenge from the database
  const registrationOptions = await c.env.DB.prepare(
    `SELECT challenge FROM registration_options WHERE user_id = ?`,
  )
    .bind(userId)
    .first<{ challenge: string }>();

  if (!registrationOptions) {
    return c.json({ error: "Challenge not found." }, 404);
  }

  // Delete the challenge from the database
  await c.env.DB.prepare(`DELETE FROM registration_options WHERE user_id = ?`)
    .bind(userId)
    .run();

  // Verify the registration response
  let verification: VerifiedRegistrationResponse;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: registrationOptions.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (error) {
    return c.json({ error: "Passkey verification failed." }, 400);
  }

  if (!verification.verified || !verification.registrationInfo) {
    return c.json({ error: "Passkey verification failed." }, 400);
  }

  // Store the registration information
  const {
    registrationInfo: {
      credentialID,
      credentialType,
      credentialPublicKey,
      counter,
      credentialDeviceType,
      credentialBackedUp,
    },
  } = verification;
  await c.env.DB.prepare(
    `INSERT INTO registrations (
      user_id,
      credential_id,
      credential_type,
      public_key,
      counter,
      device_type,
      backed_up,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      userId,
      credentialID,
      credentialType,
      credentialPublicKey,
      counter,
      credentialDeviceType,
      credentialBackedUp,
      Date.now(),
    )
    .run();

  return c.json({ message: "Passkey registered successfully." });
});

export default router;
