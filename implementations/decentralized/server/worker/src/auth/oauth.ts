import { Hono } from "hono";
import type { Bindings } from "../env";
import { verifySession } from "./session";
import { HTTPException } from "hono/http-exception";

const oauth = new Hono<{ Bindings: Bindings }>();

const AUTHORIZATION_CODE_EXPIRATION_MS = 60 * 10 * 1000; // 10 minutes

oauth.get("/authorize", async (c) => {
  const { redirect_uri, state } = c.req.query();
  if (!redirect_uri) {
    throw new HTTPException(400, {
      message: "Missing redirect_uri parameter",
    });
  }

  const url = new URL(redirect_uri);
  if (!state) {
    url.searchParams.set("error", "invalid_request");
    url.searchParams.set("error_description", "Missing state");
    return c.redirect(url.toString());
  }

  let userId: string;
  try {
    const sessionIds = await verifySession(c);
    userId = sessionIds.userId;
  } catch (error) {
    url.searchParams.set("error", "access_denied");
    url.searchParams.set("error_description", "User denied access");
    return c.redirect(url.toString());
  }

  // Create an authorization code
  const code = crypto.randomUUID();
  const createdAt = Date.now();

  // Store the authorization code in the database
  await c.env.DB.prepare(
    "INSERT INTO oauth_codes (code, redirect_uri, user_id, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(code, redirect_uri, userId, createdAt)
    .run();

  // Redirect back with the code and state
  url.searchParams.set("code", code);
  url.searchParams.set("state", state);
  return c.redirect(url.toString());
});

oauth.post("/token", async (c) => {
  const { code, redirect_uri } = c.req.query();

  // Fetch and delete the code from the database
  const result = await c.env.DB.prepare(
    "DELETE FROM oauth_codes WHERE code = ? RETURNING user_id, redirect_uri, created_at",
  )
    .bind(code)
    .first<{ user_id: string; redirect_uri: string; created_at: number }>();

  if (!result) {
    throw new HTTPException(400, {
      message: "Invalid code",
    });
  }

  // Verify the code hasn't expired
  const createdAt = result.created_at;
  if (Date.now() - createdAt > AUTHORIZATION_CODE_EXPIRATION_MS) {
    throw new HTTPException(400, {
      message: "Code expired",
    });
  }

  // Verify the redirect URI matches the one used to generate the code
  if (result.redirect_uri !== redirect_uri) {
    throw new HTTPException(400, {
      message: "Invalid redirect URI",
    });
  }

  // Create a session token (TODO)
  const accessToken = crypto.randomUUID();

  // Return the access token
  return c.json({ access_token: accessToken });
});

export default oauth;
