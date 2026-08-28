import { Hono, type Context } from "hono";
import { compress } from "hono/compress";
import { getOrigin, type Bindings } from "./env";
import app from "./app/app";
import storageBuckets from "./api/storage-buckets/index";
import indexers from "./api/inboxes/index";
import handleDids from "./app/handles/dids";
import { cors } from "hono/cors";

const router = new Hono<{ Bindings: Bindings }>();

const noCors = cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "If-None-Match"],
  exposeHeaders: ["ETag", "Retry-After"],
  maxAge: 86400, // one day
});

router.use("/app/oauth/token", noCors);
router.use("/app/oauth/revoke", noCors);
router.use("/handles/handle/*", noCors);
router.route("/app", app);
router.use("/i/*", noCors);
router.route("/i", indexers);
router.use("/s/*", noCors);
router.route("/s", storageBuckets);
function oauthConfiguration(context: Context) {
  const issuer = getOrigin(context);
  context.header("Cache-Control", "public, max-age=31536000, immutable");
  return context.json({
    issuer,
    authorization_endpoint: `${issuer}/oauth`,
    token_endpoint: `${issuer}/app/oauth/token`,
    revocation_endpoint: `${issuer}/app/oauth/revoke`,
    token_endpoint_auth_methods_supported: ["none"],
    response_types_supported: ["code"],
  });
}
router.use("/.well-known/*", noCors);
router.get("/.well-known/oauth-authorization-server", oauthConfiguration);
router.get("/.well-known/openid-configuration", oauthConfiguration);

// Route static assets
router.all("*", async (c) => {
  const url = new URL(c.req.url);
  if (
    url.pathname.startsWith("/app/") ||
    url.pathname.startsWith("/s/") ||
    url.pathname.startsWith("/i/")
  ) {
    return c.notFound();
  }

  // Disable iframes for static assets
  c.header("X-Frame-Options", "DENY");

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
        if (hostname.endsWith(`.${baseHost}`)) {
          const subdomain = hostname.slice(
            0,
            hostname.length - baseHost.length - 1,
          );
          return `/subdomain/${subdomain}${url.pathname}`;
        }
        return `/domain${url.pathname}`;
      },
    });
    hostRouter.use("/subdomain/*", noCors);
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
