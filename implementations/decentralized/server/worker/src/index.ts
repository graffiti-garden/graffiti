import { Hono } from "hono";
import { getPath } from "hono/utils/url";
import type { Bindings } from "./env";
import actors from "./actors/management";
import webauthn from "./auth/webauthn";
import oauth from "./auth/oauth";
import storageInstances from "./storage/instances";
import dids from "./actors/dids";

const app = new Hono<{ Bindings: Bindings }>({
  // Subdomains are used for specific actor DIDs.
  // Create an internal path for those subdomains.
  getPath: (req) => {
    const path = getPath(req);
    const url = new URL(req.url);
    const hostname = url.hostname;
    // TODO: make this work for more than just localhost
    if (hostname !== "localhost") {
      const subdomain = hostname.split(".")[0];
      // TODO: Account for conflict here to prevent
      // going to example.com/did/
      return `/did/${subdomain}${path}`;
    }
    return path;
  },
});

// Do not allow iframe for security
app.use("*", async (c, next) => {
  c.header("X-Frame-Options", "DENY");
  c.header("Access-Control-Allow-Origin", "none");
  await next();
});

// Route the DIDs
app.route("/did/", dids);

// Apply the APIs
app.route("/api/webauthn", webauthn);
app.route("/api/oauth", oauth);
app.route("/api/actors", actors);
app.route("/api/storage-instances", storageInstances);

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
