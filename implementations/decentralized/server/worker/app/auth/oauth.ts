import { Hono } from "hono";
import { getOrigin, type Bindings } from "../../env";
import {
  createSessionToken,
  deleteSessionToken,
  verifySessionCookie,
} from "./session";
import { HTTPException } from "hono/http-exception";
import { randomBase64 } from "./utils";
import { serviceIdToUrl } from "../../../shared/service-urls";
import { z } from "zod";

const oauth = new Hono<{ Bindings: Bindings }>();

const AUTHORIZATION_CODE_EXPIRATION_MS = 60 * 10 * 1000; // 10 minutes

// This is called once a user clicks logs in and clicks
// "Authorize" in the server-side web app.
// Cross origin fetches are blocked.
oauth.post("/authorize", async (c) => {
  const origin = c.req.header("Origin");
  if (origin && origin !== getOrigin(c)) {
    throw new HTTPException(403, { message: "Invalid origin" });
  }
  const { accountId } = await verifySessionCookie(c);

  const parsed = z.object({
    redirect_uri: z.url(),
    state: z.string(),
    scope: z.array(z.string()),
  }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid authorization request" });
  }
  const { redirect_uri, state, scope } = parsed.data;

  const url = new URL(redirect_uri);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new HTTPException(400, { message: "Invalid redirect URI" });
  }

  const baseHost = new URL(getOrigin(c)).host;
  const [buckets, inboxes] = await Promise.all([
    c.env.DB.prepare("SELECT bucket_id FROM storage_buckets WHERE account_id = ?")
      .bind(accountId).all<{ bucket_id: string }>(),
    c.env.DB.prepare("SELECT inbox_id FROM inboxes WHERE account_id = ?")
      .bind(accountId).all<{ inbox_id: string }>(),
  ]);
  const services = new Set([
    ...buckets.results.map(({ bucket_id }) => serviceIdToUrl(bucket_id, "bucket", baseHost)),
    ...inboxes.results.map(({ inbox_id }) => serviceIdToUrl(inbox_id, "inbox", baseHost)),
    serviceIdToUrl("shared", "inbox", baseHost),
  ]);
  if (scope.some((endpoint) => !services.has(endpoint))) {
    throw new HTTPException(403, { message: "Account does not own the requested services" });
  }

  // Create an authorization code
  const code = randomBase64();
  const createdAt = Date.now();

  // Store the authorization code in the database
  await c.env.DB.prepare(
    "INSERT INTO oauth_codes (code, redirect_uri, account_id, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(code, redirect_uri, accountId, createdAt)
    .run();

  // The browser will navigate to this URL after receiving the response.
  url.searchParams.set("code", code);
  url.searchParams.set("state", state);
  return c.json({ redirectUri: url.toString() });
});

oauth.post("/token", async (c) => {
  const params = new URLSearchParams(await c.req.text());
  const code = params.get("code");
  const redirect_uri = params.get("redirect_uri");
  if (!code) {
    throw new HTTPException(400, {
      message: "Missing code parameter",
    });
  }
  if (!redirect_uri) {
    throw new HTTPException(400, {
      message: "Missing redirect_uri parameter",
    });
  }

  // Fetch and delete the code from the database
  const result = await c.env.DB.prepare(
    "DELETE FROM oauth_codes WHERE code = ? RETURNING account_id, redirect_uri, created_at",
  )
    .bind(code)
    .first<{ account_id: number; redirect_uri: string; created_at: number }>();

  if (!result) {
    throw new HTTPException(401, {
      message: "Invalid code",
    });
  }

  // Verify the code hasn't expired
  const createdAt = result.created_at;
  if (Date.now() - createdAt > AUTHORIZATION_CODE_EXPIRATION_MS) {
    throw new HTTPException(401, {
      message: "Code expired",
    });
  }

  // Verify the redirect URI matches the one used to generate the code
  if (result.redirect_uri !== redirect_uri) {
    throw new HTTPException(401, {
      message: "Invalid redirect URI",
    });
  }

  // Create a session token
  const { token } = await createSessionToken(c, result.account_id);

  // Return the access token
  return c.json({ access_token: token, token_type: "bearer" });
});

oauth.post("/revoke", async (c) => {
  // Get the token from an "application/x-www-form-urlencoded" body
  const params = new URLSearchParams(await c.req.text());
  const token = params.get("token");
  if (!token) {
    throw new HTTPException(400, {
      message: "Missing token parameter",
    });
  }
  await deleteSessionToken(c, token);
  return c.json({ revoked: true });
});

export default oauth;
