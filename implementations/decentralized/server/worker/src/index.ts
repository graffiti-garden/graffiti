import { Hono } from "hono";
import type { Bindings } from "./env";
import webauthn from "./auth/webauthn";
import oauth from "./auth/oauth";
import serviceInstanceManagement from "./service-instances/management";
import handleManagement from "./handles/management";
import actorManagement from "./actors/management";
import handleDids from "./handles/dids";

const app = new Hono<{ Bindings: Bindings }>();

// Do not allow iframe for security
app.use("*", async (c, next) => {
  c.header("X-Frame-Options", "DENY");
  c.header("Access-Control-Allow-Origin", "none");
  await next();
});

// Apply the APIs
app.route("/api/webauthn", webauthn);
app.route("/api/oauth", oauth);
app.route("/api/handles", handleManagement);
app.route("/api/actors", actorManagement);
app.route("/api/service-instances", serviceInstanceManagement);

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
let hostRouter: Hono<{ Bindings: Bindings }> | undefined = undefined;
function getHostRouter(baseHost: string): Hono<{ Bindings: Bindings }> {
  if (!hostRouter) {
    hostRouter = new Hono<{ Bindings: Bindings }>({
      getPath: (req) => {
        const url = new URL(req.url);
        const hostname = url.hostname;
        for (const host of [baseHost, "localhost"]) {
          if (hostname !== host && hostname.endsWith(`.${host}`)) {
            const subdomain = hostname.slice(
              0,
              hostname.length - host.length - 1,
            );
            return `/subdomain/${subdomain}${url.pathname}`;
          }
        }
        return `/domain${url.pathname}`;
      },
    });
    hostRouter.route("/subdomain", handleDids);
    hostRouter.route("/domain", app);
  }
  return hostRouter;
}

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    return getHostRouter(env.BASE_HOST).fetch(request, env, ctx);
  },
};
