import { Hono } from "hono";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
} from "@simplewebauthn/server";
import {
  createSession,
  createTempSession,
  deleteSession,
  verifySession,
} from "./session";

type Bindings = {
  DB: D1Database;
};

const CHALLENGE_MAX_AGE = 15 * 60 * 1000; // 15 minutes
const router = new Hono<{ Bindings: Bindings }>();

const rpName = "Graffiti";
function getRp(req: { url: string }) {
  const url = new URL(req.url);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    // In dev the worker is proxied into the vite web server,
    // so make sure to use the vite web server's port
    return { rpId: "localhost", origin: "http://localhost:5173" };
  }
  const rpId = url.hostname;
  const origin = url.origin;
  return { rpId, origin };
}

router.get("/register/challenge", async (c) => {
  let sessionId: string;
  let userId: string;
  try {
    // If adding a registration to an existing user,
    // we get the existing session
    const result = await verifySession(c);
    sessionId = result.sessionId;
    userId = result.userId;
  } catch (error) {
    sessionId = await createTempSession(c);
    userId = crypto.randomUUID();
  }

  const { rpId } = getRp(c.req);

  const options = await generateRegistrationOptions({
    rpName,
    rpID: rpId,
    attestationType: "none",
    userDisplayName: `Graffiti User ${userId}`,
    userName: `Graffiti User ${userId}`,
    userID: userId,
  });

  // Store the challenge for later
  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO passkey_registration_challenges (
      session_id,
      user_id,
      challenge,
      created_at
    ) VALUES (?, ?, ?, ?)`,
  )
    .bind(sessionId, userId, options.challenge, Date.now())
    .run();

  return c.json(options);
});

router.post("/register/verify", async (c) => {
  const { sessionId } = await verifySession(c, { allowTemp: true });

  // Fetch and delete the challenge
  const registrationOptions = await c.env.DB.prepare(
    `DELETE FROM passkey_registration_challenges
     WHERE session_id = ?
     RETURNING challenge, user_id, created_at`,
  )
    .bind(sessionId)
    .first<{ challenge: string; user_id: string; created_at: number }>();

  if (!registrationOptions) {
    return c.json({ error: "Challenge not found." }, 404);
  }

  const {
    challenge,
    user_id: userId,
    created_at: createdAt,
  } = registrationOptions;

  if (Date.now() - createdAt > CHALLENGE_MAX_AGE) {
    return c.json({ error: "Challenge expired." }, 400);
  }

  const { rpId, origin } = getRp(c.req);

  const response = await c.req.json();
  let verification: VerifiedRegistrationResponse;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpId,
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
      credentialType,
      credentialPublicKey,
      counter,
      credentialDeviceType,
      credentialBackedUp,
    },
  } = verification;
  const credentialId = response.id;
  await c.env.DB.prepare(
    `INSERT INTO passkeys (
      credential_id,
      user_id,
      credential_type,
      public_key,
      counter,
      device_type,
      backed_up,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      credentialId,
      userId,
      credentialType,
      credentialPublicKey,
      counter,
      credentialDeviceType,
      credentialBackedUp,
      Date.now(),
    )
    .run();

  // Store a proper session for the user
  await createSession(c, userId);
  return c.json({ message: "Passkey registered successfully." });
});

router.get("/authenticate/challenge", async (c) => {
  const sessionId = await createTempSession(c);

  const { rpId } = getRp(c.req);

  const { challenge } = await generateAuthenticationOptions({ rpID: rpId });

  // Store the challenge for later
  await c.env.DB.prepare(
    `INSERT INTO passkey_authentication_challenges (
      session_id,
      challenge,
      created_at
    ) VALUES (?, ?, ?)`,
  )
    .bind(sessionId, challenge, Date.now())
    .run();

  return c.json({ challenge });
});

router.post("/authenticate/verify", async (c) => {
  const { sessionId } = await verifySession(c, { allowTemp: true });

  // Find and delete the challenge
  const result = await c.env.DB.prepare(
    `DELETE FROM passkey_authentication_challenges WHERE session_id = ? RETURNING challenge, created_at`,
  )
    .bind(sessionId)
    .first<{ challenge: string; created_at: number }>();

  if (!result) {
    return c.json({ error: "Challenge not found." }, 404);
  }

  const { challenge, created_at: createdAt } = result;
  if (Date.now() - createdAt > CHALLENGE_MAX_AGE) {
    return c.json({ error: "Challenge expired." }, 400);
  }

  const { rpId, origin } = getRp(c.req);
  const response = await c.req.json();
  const credentialId = response.id;

  const userPasskey = await c.env.DB.prepare(
    `SELECT user_id, public_key, counter FROM passkeys WHERE credential_id = ?`,
  )
    .bind(credentialId)
    .first<{
      user_id: string;
      public_key: ArrayBuffer;
      counter: number;
    }>();

  if (!userPasskey) {
    return c.json({ error: "User not found." }, 404);
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedOrigin: origin,
    expectedRPID: rpId,
    expectedChallenge: challenge,
    authenticator: {
      credentialID: credentialId,
      credentialPublicKey: new Uint8Array(userPasskey.public_key),
      counter: userPasskey.counter,
    },
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.authenticationInfo) {
    return c.json({ error: "Invalid authentication response." }, 400);
  }

  const { newCounter } = verification.authenticationInfo;

  await c.env.DB.prepare(
    `UPDATE passkeys SET counter = ? WHERE credential_id = ?`,
  )
    .bind(newCounter, credentialId)
    .run();

  await createSession(c, userPasskey.user_id);
  return c.json({ message: "Passkey authenticated successfully." });
});

router.get("/logged-in", async (c) => {
  await verifySession(c);
  return c.json({ message: "Logged in." });
});

router.post("/logout", async (c) => {
  await deleteSession(c);
  return c.json({ message: "Logged out." });
});

export default router;
