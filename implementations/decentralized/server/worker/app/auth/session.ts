import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Bindings } from "../../env";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { randomBytes, encodeBase64, decodeBase64 } from "./utils";
import { LRUCache } from "lru-cache";

const CACHE_CAPACITY = 1000;
const INACTIVITY_TIMEOUT_MS = 1000 * 60 * 60 * 24 * 10; // 10 days
const ACTIVITY_CHECK_INTERVAL_MS = 1000 * 60 * 60; // 1 hour
const COOKIE_NAME = "session";
const TEMP_USER_ID = -1;

const sessionCache = new LRUCache<
  string,
  { userId: number; lastVerifiedAt: number }
>({ max: CACHE_CAPACITY, ttl: INACTIVITY_TIMEOUT_MS });

export async function createSessionToken(
  context: Context<{ Bindings: Bindings }>,
  userId: number,
) {
  // Create a session for the corresponding user
  const secret = randomBytes();
  const secretHash = await hashSecret(secret);
  const createdAt = Date.now();

  // Store the session for verification
  const result = await context.env.DB.prepare(
    `INSERT INTO sessions (user_id, secret_hash, created_at, last_verified_at) VALUES (?, ?, ?, ?) RETURNING session_id`,
  )
    .bind(userId, secretHash, createdAt, createdAt)
    .first<{ session_id: number }>();
  const sessionId = result?.session_id;
  if (!sessionId) {
    throw new HTTPException(500, { message: "Failed to create session." });
  }

  const secretBase64 = encodeBase64(secret);

  // Store the session as a cookie
  const token = sessionId + "." + secretBase64;

  // Store the session in the cache
  sessionCache.set(token, { userId, lastVerifiedAt: createdAt });

  return { sessionId, token };
}

export async function verifySessionToken(
  context: Context<{ Bindings: Bindings }>,
  token: string,
  options?: {
    allowTemp?: boolean;
  },
) {
  let userId: number;
  let lastVerifiedAt: number;
  const [sessionIdString, secretBase64] = token.split(".");
  const sessionId = Number(sessionIdString);

  // First, check if the token is in the cache
  const cached = sessionCache.get(token);
  if (cached) {
    userId = cached.userId;
    lastVerifiedAt = cached.lastVerifiedAt;
  } else {
    let secret: Uint8Array;
    try {
      secret = decodeBase64(secretBase64);
    } catch {
      throw new HTTPException(401, { message: "Invalid session." });
    }
    const secretHash = await hashSecret(secret);

    const result = await context.env.DB.prepare(
      `SELECT user_id, last_verified_at FROM sessions WHERE session_id = ? AND secret_hash = ?`,
    )
      .bind(sessionId, secretHash)
      .first<{ user_id: number; last_verified_at: number }>();

    if (!result) {
      throw new HTTPException(401, { message: "Invalid session." });
    }
    lastVerifiedAt = result.last_verified_at;
    userId = result.user_id;

    // Store in the cache
    sessionCache.set(token, { userId, lastVerifiedAt });
  }

  const now = Date.now();

  if (now - lastVerifiedAt >= INACTIVITY_TIMEOUT_MS) {
    await context.env.DB.prepare(`DELETE FROM sessions WHERE session_id = ?`)
      .bind(sessionId)
      .run();

    // Remove from the cache
    sessionCache.delete(token);

    throw new HTTPException(401, { message: "Session expired." });
  }

  if (now - lastVerifiedAt >= ACTIVITY_CHECK_INTERVAL_MS) {
    await context.env.DB.prepare(
      `UPDATE sessions SET last_verified_at = ? WHERE session_id = ?`,
    )
      .bind(now, sessionId)
      .run();

    // Update the cache
    sessionCache.set(token, { userId, lastVerifiedAt: now });
  }

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
  const url = new URL(context.req.url);
  setCookie(context, COOKIE_NAME, token, {
    maxAge: INACTIVITY_TIMEOUT_MS / 1000,
    path: "/",
    sameSite: "lax",
    secure: url.hostname !== "localhost",
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

export async function getHeaderToken(context: Context<{ Bindings: Bindings }>) {
  const bearerToken = context.req.header("Authorization");
  if (!bearerToken) {
    throw new HTTPException(401, { message: "Not logged in." });
  }
  const bearerPrefix = "Bearer ";
  if (!bearerToken.startsWith(bearerPrefix)) {
    throw new HTTPException(400, { message: "Invalid token format" });
  }
  return bearerToken.slice(bearerPrefix.length);
}

export async function verifySessionHeader(
  context: Context<{ Bindings: Bindings }>,
  options?: {
    allowTemp?: boolean;
  },
) {
  const token = await getHeaderToken(context);
  return await verifySessionToken(context, token, options);
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

async function hashSecret(secret: Uint8Array) {
  const secretHash = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(secret),
  );
  return secretHash;
}
