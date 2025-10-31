import { Hono } from "hono";
import username from "./username";
import webauthn from "./webauthn";

type Bindings = {
  // Wrangler binds the static asset service here
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

// Do not allow iframe for security
app.use("*", async (c, next) => {
  c.header("X-Frame-Options", "DENY");
  await next();
});

// Apply the APIs
app.route("/api/webauthn", webauthn);
app.route("/api/username", username);

// Route static assets
app.all("*", async (c) => {
  const url = new URL(c.req.url);
  if (url.pathname.startsWith("/api")) {
    return c.notFound();
  }

  // Try to serve a static asset first.
  const assetRes = await c.env.ASSETS.fetch(c.req.raw);
  if (assetRes.status !== 404) return assetRes;

  // If no asset then assume it is a page in the single-page app
  // if the end does not have a file extension
  const looksLikeFile = url.pathname.split("/").pop()?.includes(".");
  if (!looksLikeFile) {
    const indexReq = new Request(new URL("/", url).toString(), c.req.raw);
    return c.env.ASSETS.fetch(indexReq);
  }

  return assetRes;
});

export default app;
