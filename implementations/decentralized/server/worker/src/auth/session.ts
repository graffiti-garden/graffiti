import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Bindings } from "../env";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { randomBase64, randomBytes, encodeBase64, decodeBase64 } from "./utils";

const INACTIVITY_TIMEOUT_MS = 1000 * 60 * 60 * 24 * 10; // 10 days
const ACTIVITY_CHECK_INTERVAL_MS = 1000 * 60 * 60; // 1 hour
const COOKIE_NAME = "session";
const TEMP_USER_ID = "temp";

export async function createSessionToken(
  context: Context<{ Bindings: Bindings }>,
  userId: string,
) {
  // Create a session for the corresponding user
  const sessionId = randomBase64();
  const secret = randomBytes();
  const secretHash = await hashSecret(secret);
  const createdAt = Date.now();

  // Store the session for verification
  await context.env.DB.prepare(
    `INSERT INTO sessions (session_id, user_id, secret_hash, created_at, last_verified_at) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(sessionId, userId, secretHash, createdAt, createdAt)
    .run();

  const secretBase64 = encodeBase64(secret);

  // Store the session as a cookie
  const token = sessionId + "." + secretBase64;

  return { sessionId, token };
}

export async function verifySessionToken(
  context: Context<{ Bindings: Bindings }>,
  token: string,
  options?: {
    allowTemp?: boolean;
  },
) {
  const [sessionId, secretBase64] = token.split(".");
  const secret = decodeBase64(secretBase64);
  const secretHash = await hashSecret(secret);

  const result = await context.env.DB.prepare(
    `SELECT * FROM sessions WHERE session_id = ? AND secret_hash = ?`,
  )
    .bind(sessionId, secretHash)
    .first<{ user_id: string; last_verified_at: number }>();

  if (!result) {
    throw new HTTPException(401, { message: "Invalid session." });
  }

  const now = Date.now();
  const lastVerifiedAt = result.last_verified_at;

  if (now - lastVerifiedAt >= INACTIVITY_TIMEOUT_MS) {
    await context.env.DB.prepare(`DELETE FROM sessions WHERE session_id = ?`)
      .bind(sessionId)
      .run();
    throw new HTTPException(401, { message: "Session expired." });
  }

  if (now - lastVerifiedAt >= ACTIVITY_CHECK_INTERVAL_MS) {
    await context.env.DB.prepare(
      `UPDATE sessions SET last_verified_at = ? WHERE session_id = ?`,
    )
      .bind(now, sessionId)
      .run();
  }

  const userId = result.user_id;
  if (userId === TEMP_USER_ID && !options?.allowTemp) {
    throw new HTTPException(401, { message: "Temporary user not allowed." });
  }

  return { userId, sessionId };
}

export async function deleteSessionToken(
  context: Context<{ Bindings: Bindings }>,
  token: string,
) {
  const { sessionId, userId } = await verifySessionToken(context, token);
  await context.env.DB.prepare(`DELETE FROM sessions WHERE session_id = ?`)
    .bind(sessionId)
    .run();
  return { sessionId, userId };
}

function setTokenCookie(
  context: Context<{ Bindings: Bindings }>,
  token: string,
) {
  setCookie(context, COOKIE_NAME, token, {
    maxAge: INACTIVITY_TIMEOUT_MS / 1000,
    path: "/",
    sameSite: "lax",
    secure: true,
    httpOnly: true,
  });
}

export async function createSessionCookie(
  ...args: Parameters<typeof createSessionToken>
) {
  const { sessionId, token } = await createSessionToken(...args);
  setTokenCookie(args[0], token);
  return sessionId;
}

export async function createTempSessionCookie(
  context: Context<{ Bindings: Bindings }>,
) {
  return await createSessionCookie(context, TEMP_USER_ID);
}

export async function verifySessionCookie(
  context: Context<{ Bindings: Bindings }>,
  options?: {
    allowTemp?: boolean;
  },
) {
  const token = getCookie(context, COOKIE_NAME);
  if (!token) {
    throw new HTTPException(401, { message: "Not logged in." });
  }

  let result: Awaited<ReturnType<typeof verifySessionToken>>;
  try {
    result = await verifySessionToken(context, token, options);
  } catch (error) {
    deleteCookie(context, COOKIE_NAME);
    throw error;
  }

  setTokenCookie(context, token);

  return result;
}

export async function deleteSessionCookie(
  context: Context<{ Bindings: Bindings }>,
) {
  const token = getCookie(context, COOKIE_NAME);
  if (!token) {
    throw new HTTPException(401, { message: "Not logged in." });
  }
  const result = await deleteSessionToken(context, token);
  deleteCookie(context, COOKIE_NAME);
  return result;
}

async function hashSecret(secret: Uint8Array<ArrayBuffer>) {
  const secretHash = await crypto.subtle.digest("SHA-256", secret);
  return secretHash;
}
