import { Hono, type Context } from "hono";
import { getOrigin, type Bindings } from "../../env";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
} from "@simplewebauthn/server";
import {
  createSessionCookie,
  createTempSessionCookie,
  deleteSessionCookie,
  verifySessionCookie,
} from "./session";
import { HTTPException } from "hono/http-exception";

const CHALLENGE_MAX_AGE = 15 * 60 * 1000; // 15 minutes
const webauthn = new Hono<{ Bindings: Bindings }>();

function getRp(context: Context) {
  const origin = getOrigin(context);
  const rpId = new URL(origin).hostname;
  return { rpId, origin };
}

webauthn.get("/register/challenge", async (c) => {
  let sessionId: number;
  let userId: number;
  try {
    // If adding a registration to an existing user,
    // we get the existing session
    const result = await verifySessionCookie(c);
    sessionId = result.sessionId;
    userId = result.userId;
  } catch (error) {
    // Create a user
    const result = await c.env.DB.prepare(
      `INSERT INTO users (created_at) VALUES (?) RETURNING user_id`,
    )
      .bind(Date.now())
      .first<{ user_id: number }>();
    if (!result) {
      throw new HTTPException(500, { message: "Failed to create user." });
    }

    userId = result.user_id;
    sessionId = await createTempSessionCookie(c);
  }

  const { rpId } = getRp(c);

  const origin = new URL(getOrigin(c));
  const host = origin.host;
  const displayName = `${host} account #${userId}`;
  const options = await generateRegistrationOptions({
    rpName: host,
    rpID: rpId,
    attestationType: "none",
    userDisplayName: displayName,
    userName: displayName,
    userID: new TextEncoder().encode(userId.toString()),
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

webauthn.post("/register/verify", async (c) => {
  const { sessionId } = await verifySessionCookie(c, { allowTemp: true });

  // Fetch and delete the challenge
  const registrationOptions = await c.env.DB.prepare(
    `DELETE FROM passkey_registration_challenges
     WHERE session_id = ?
     RETURNING challenge, user_id, created_at`,
  )
    .bind(sessionId)
    .first<{ challenge: string; user_id: number; created_at: number }>();

  if (!registrationOptions) {
    return c.text("Challenge not found.", 404);
  }

  const {
    challenge,
    user_id: userId,
    created_at: createdAt,
  } = registrationOptions;

  if (Date.now() - createdAt > CHALLENGE_MAX_AGE) {
    return c.text("Challenge expired.", 400);
  }

  const { rpId, origin } = getRp(c);

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
    return c.text("Passkey verification failed.", 400);
  }

  if (!verification.verified || !verification.registrationInfo) {
    return c.json({ error: "Passkey verification failed." }, 400);
  }

  // Store the registration information
  const {
    registrationInfo: {
      credentialType,
      credential: { counter, publicKey },
      credentialDeviceType,
      credentialBackedUp,
    },
  } = verification;
  const credentialId = response.id;
  await c.env.DB.prepare(
    `INSERT INTO passkeys (
      credential_id,
      user_id,
      public_key,
      counter,
      credential_type,
      device_type,
      backed_up,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      credentialId,
      userId,
      publicKey,
      counter,
      // Are the values below necessary?
      credentialType,
      credentialDeviceType,
      credentialBackedUp,
      Date.now(),
    )
    .run();

  // Store a proper session for the user
  await createSessionCookie(c, userId);
  return c.json({ message: "Passkey registered successfully." });
});

webauthn.get("/authenticate/challenge", async (c) => {
  const sessionId = await createTempSessionCookie(c);

  const { rpId } = getRp(c);

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

webauthn.post("/authenticate/verify", async (c) => {
  const { sessionId } = await verifySessionCookie(c, { allowTemp: true });

  // Find and delete the challenge
  const result = await c.env.DB.prepare(
    `DELETE FROM passkey_authentication_challenges WHERE session_id = ? RETURNING challenge, created_at`,
  )
    .bind(sessionId)
    .first<{ challenge: string; created_at: number }>();

  if (!result) {
    return c.text("Challenge not found.", 404);
  }

  const { challenge, created_at: createdAt } = result;
  if (Date.now() - createdAt > CHALLENGE_MAX_AGE) {
    return c.text("Challenge expired.", 400);
  }

  const { rpId, origin } = getRp(c);
  const response = await c.req.json();
  const credentialId = response.id;

  const userPasskey = await c.env.DB.prepare(
    `SELECT user_id, public_key, counter FROM passkeys WHERE credential_id = ?`,
  )
    .bind(credentialId)
    .first<{
      user_id: number;
      public_key: ArrayBuffer;
      counter: number;
    }>();

  if (!userPasskey) {
    return c.text("User not found.", 404);
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedOrigin: origin,
    expectedRPID: rpId,
    expectedChallenge: challenge,
    credential: {
      id: credentialId,
      counter: userPasskey.counter,
      publicKey: new Uint8Array(userPasskey.public_key),
    },
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.authenticationInfo) {
    return c.text("Invalid authentication response.", 400);
  }

  const { newCounter } = verification.authenticationInfo;

  // Update the counter if necessary
  if (userPasskey.counter !== newCounter) {
    await c.env.DB.prepare(
      `UPDATE passkeys SET counter = ? WHERE credential_id = ?`,
    )
      .bind(newCounter, credentialId)
      .run();
  }

  // Delete the temp cookie
  deleteSessionCookie(c);
  await createSessionCookie(c, userPasskey.user_id);
  return c.json({ message: "Passkey authenticated successfully." });
});

webauthn.get("/logged-in", async (c) => {
  await verifySessionCookie(c);
  return c.json({ message: "Logged in." });
});

webauthn.post("/logout", async (c) => {
  await deleteSessionCookie(c);
  return c.json({ message: "Logged out." });
});

export default webauthn;
