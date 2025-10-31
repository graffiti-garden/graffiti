import { type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

type Bindings = {
  DB: D1Database;
};

const INACTIVITY_TIMEOUT_MS = 1000 * 60 * 60 * 24 * 10; // 10 days
const ACTIVITY_CHECK_INTERVAL_MS = 1000 * 60 * 60; // 1 hour
const COOKIE_NAME = "session";

export async function createSession(
  userId: string,
  context: Context<{ Bindings: Bindings }>,
) {
  // Create a session for the corresponding user
  const sessionId = crypto.randomUUID();
  const secret = crypto.randomUUID();
  const secretHash = await hashSecret(secret);
  const createdAt = Date.now();

  // Store the session for verification
  await context.env.DB.prepare(
    `INSERT INTO sessions (session_id, user_id, secret_hash, created_at, last_verified_at) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(sessionId, userId, secretHash, createdAt, createdAt)
    .run();

  // Store the session as a cookie
  const token = sessionId + "." + secret;
  setTokenCookie(context, token);
}

export async function verifySession(context: Context<{ Bindings: Bindings }>) {
  const token = getCookie(context, COOKIE_NAME);
  if (!token) {
    throw new HTTPException(401, { message: "Not logged in" });
  }

  const [sessionId, secret] = token.split(".");
  const secretHash = await hashSecret(secret);

  const result = await context.env.DB.prepare(
    `SELECT * FROM sessions WHERE session_id = ? AND secret_hash = ?`,
  )
    .bind(sessionId, secretHash)
    .first<{ user_id: string; last_verified_at: number }>();

  if (!result) {
    deleteCookie(context, COOKIE_NAME);
    throw new HTTPException(401, { message: "Invalid session" });
  }

  const now = Date.now();
  const lastVerifiedAt = result.last_verified_at;

  if (now - lastVerifiedAt >= INACTIVITY_TIMEOUT_MS) {
    await context.env.DB.prepare(`DELETE FROM sessions WHERE session_id = ?`)
      .bind(sessionId)
      .run();
    deleteCookie(context, COOKIE_NAME);
    throw new HTTPException(401, { message: "Session expired" });
  }

  if (now - lastVerifiedAt >= ACTIVITY_CHECK_INTERVAL_MS) {
    await context.env.DB.prepare(
      `UPDATE sessions SET last_verified_at = ? WHERE session_id = ?`,
    )
      .bind(now, sessionId)
      .run();
    setTokenCookie(context, token);
  }

  return result.user_id;
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

async function hashSecret(secret: string) {
  const secretBytes = new TextEncoder().encode(secret);
  const secretHash = await crypto.subtle.digest("SHA-256", secretBytes);
  return secretHash;
}
