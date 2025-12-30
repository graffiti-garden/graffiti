import { Hono } from "hono";
import { OpenAPIHono } from "@hono/zod-openapi";
import { compress } from "hono/compress";
import { swaggerUI } from "@hono/swagger-ui";
import type { Bindings } from "./env";
import app from "./app/app";
import storageBuckets from "./storage-buckets/index";
import indexers from "./indexers/index";
import handleDids from "./app/handles/dids";

const router = new OpenAPIHono<{ Bindings: Bindings }>();

router.openAPIRegistry.registerComponent("securitySchemes", "oauth2", {
  type: "oauth2",
  flows: {
    authorizationCode: {
      authorizationUrl: "/oauth",
      tokenUrl: "/app/oauth/token",
      scopes: {},
    },
  },
});

router.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Graffiti HTTPS API",
    version: "1.0.0",
    description: "An implementation of the Graffiti meta API over HTTPS",
  },
});

router.get(
  "/docs",
  swaggerUI({
    url: "/openapi.json",
    persistAuthorization: true,
  }),
);

router.get("/oauth2-redirect.html", (c) =>
  c.html(`<!doctype html>
  <html lang="en-US">
  <body>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.31.0/oauth2-redirect.js"></script>
  </body>
</html>`),
);

router.route("/app", app);
router.route("/i", indexers);
router.route("/s", storageBuckets);

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
