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
  deleteTempSessionCookie,
  listSessionAccounts,
  verifySessionCookie,
  verifyTempSessionCookie,
} from "./session";
import { HTTPException } from "hono/http-exception";
import {
  CHALLENGE_MAX_AGE,
  getHandleName,
  prepareHandleInsertFromReservation,
  reserveHandle,
} from "../handles/registration";

const webauthn = new Hono<{ Bindings: Bindings }>();

function getRp(context: Context) {
  const origin = getOrigin(context);
  const rpId = new URL(origin).hostname;
  return { rpId, origin };
}

webauthn.post("/register/challenge", async (c) => {
  let sessionId: number;
  let userId: number;
  let name: string;
  if (c.req.header("X-Graffiti-Account") !== undefined) {
    // An existing account can still add another passkey.
    const result = await verifySessionCookie(c);
    sessionId = result.sessionId;
    userId = result.userId;
    name = (await getHandleName(c.env.DB, userId)) ?? `Account #${userId}`;
  } else {
    // The challenge is provided with a name for a new handle
    name = (await c.req.json()).name;

    // Reuse the temporary session when a passkey prompt is cancelled and retried.
    try {
      sessionId = (await verifyTempSessionCookie(c)).sessionId;
    } catch (error) {
      if (!(error instanceof HTTPException && error.status === 401)) throw error;
      sessionId = await createTempSessionCookie(c);
    }

    // Temporarily reserve the handle for this session
    // so it doesn't get scooped while the user is in the passkey prompt.
    await reserveHandle(c.env.DB, name, sessionId);

    // Create a new user ID for this registration attempt.
    const result = await c.env.DB.prepare(
      "INSERT INTO users (created_at) VALUES (?) RETURNING user_id",
    )
      .bind(Date.now())
      .first<{ user_id: number }>();
    if (!result) {
      throw new HTTPException(500, { message: "Failed to create user." });
    }
    userId = result.user_id;
  }

  const { rpId } = getRp(c);

  const host = new URL(getOrigin(c)).host;
  const options = await generateRegistrationOptions({
    rpName: host,
    rpID: rpId,
    attestationType: "none",
    // The user's chosen name is what is displayed in their passkey
    userDisplayName: name,
    userName: name,
    // The credential's user ID stays the same when its handle changes.
    userID: Uint8Array.from(new TextEncoder().encode(userId.toString())),
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
  // A signed-in account can add a passkey; a new account uses the temp cookie.
  const { sessionId, userId: sessionUserId } =
    c.req.header("X-Graffiti-Account") === undefined
      ? await verifyTempSessionCookie(c)
      : await verifySessionCookie(c);

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
  const creating = sessionUserId === -1;
  if (!creating && sessionUserId !== userId) {
    return c.text("Invalid registration session.", 401);
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
  const statements = [
    c.env.DB.prepare(
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
    ).bind(
      credentialId,
      userId,
      publicKey,
      counter,
      // Are the values below necessary?
      credentialType,
      credentialDeviceType,
      credentialBackedUp,
      Date.now(),
    ),
  ];

  if (creating) {
    statements.push(
      prepareHandleInsertFromReservation(c.env.DB, userId, sessionId),
    );
  }
  try {
    await c.env.DB.batch(statements);
  } catch (error) {
    if (
      creating &&
      String(error).includes("NOT NULL constraint failed: handles.name")
    ) {
      return c.text("Handle reservation expired. Please start again.", 409);
    }
    throw error;
  }

  // Store a proper session for the user
  if (sessionUserId === -1) await deleteTempSessionCookie(c);
  await createSessionCookie(c, userId);
  return c.json({ message: "Passkey registered successfully.", accountId: userId });
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
  const { sessionId } = await verifyTempSessionCookie(c);

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
  await deleteTempSessionCookie(c);
  await createSessionCookie(c, userPasskey.user_id);
  return c.json({
    message: "Passkey authenticated successfully.",
    accountId: userPasskey.user_id,
  });
});

webauthn.get("/accounts", async (c) => {
  c.header("Cache-Control", "no-store");
  const ids = await listSessionAccounts(c);
  const accounts = await Promise.all(
    ids.map(async (id) => {
      const handle = await c.env.DB.prepare(
        "SELECT name FROM handles WHERE user_id = ?",
      )
        .bind(id)
        .first<{ name: string }>();
      return { id, handle: handle?.name ?? null };
    }),
  );
  return c.json({ accounts });
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
