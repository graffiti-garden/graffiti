import { Hono } from "hono";
import { compress } from "hono/compress";
import type { Bindings } from "./env";
import app from "./app/app";
import storageBuckets from "./api/storage-buckets/index";
import indexers from "./api/inboxes/index";
import handleDids from "./app/handles/dids";

const router = new Hono<{ Bindings: Bindings }>();

router.route("/app", app);
router.route("/i", indexers);
router.route("/s", storageBuckets);
router.get("/.well-known/oauth-authorization-server", async (c) => {
  const issuer = `https://${c.env.BASE_HOST}`;
  const headers = new Headers();
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return c.json({
    issuer,
    authorization_endpoint: `${issuer}/oauth`,
    token_endpoint: `${issuer}/app/oauth/token`,
    token_endpoint_auth_methods_supported: ["none"],
    response_types_supported: ["code"],
  });
});

// Route static assets
router.all("*", async (c) => {
  const url = new URL(c.req.url);
  if (
    url.pathname.startsWith("/app") ||
    url.pathname.startsWith("/s") ||
    url.pathname.startsWith("/i")
  ) {
    return c.notFound();
  }

  // Disable cross origin for static assets
  c.header("X-Frame-Options", "DENY");
  c.header("Access-Control-Allow-Origin", "none");

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
    hostRouter.route("/domain", router);
    hostRouter.use(compress());
  }
  return hostRouter;
}

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    return getHostRouter(env.BASE_HOST).fetch(request, env, ctx);
  },
};
