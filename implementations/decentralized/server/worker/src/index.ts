import { Hono } from "hono";
import type { Bindings } from "./env";
import actors from "./actors/management";
import webauthn from "./auth/webauthn";
import oauth from "./auth/oauth";
import storageInstances from "./storage/instances";
import dids from "./actors/dids";

const app = new Hono<{ Bindings: Bindings }>();

const BASE_HOST = "graffiti.theiahenderson.workers.dev";

// Do not allow iframe for security
app.use("*", async (c, next) => {
  c.header("X-Frame-Options", "DENY");
  c.header("Access-Control-Allow-Origin", "none");
  await next();
});

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

// Subdomains are used for specific actor DIDs.
// Route those directly to the DID router
const hostRouter = new Hono<{ Bindings: Bindings }>({
  getPath: (req) => {
    const url = new URL(req.url);
    const hostname = url.hostname;
    for (const base_host of [BASE_HOST, "localhost"]) {
      if (hostname !== base_host && hostname.endsWith(`.${base_host}`)) {
        const subdomain = hostname.slice(
          0,
          hostname.length - base_host.length - 1,
        );
        return `/subdomain/${subdomain}${url.pathname}`;
      }
    }
    return `/domain${url.pathname}`;
  },
});
hostRouter.route("/subdomain", dids);
hostRouter.route("/domain", app);

export default hostRouter;
