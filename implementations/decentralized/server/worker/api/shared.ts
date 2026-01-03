import type { Context } from "hono";
import type { Bindings } from "../env";
import { type OpenAPIHono, z, createRoute } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { HTTPException } from "hono/http-exception";
import { serviceIdToUrl } from "../../shared/service-urls";

const Base64IdSchema = z.base64url().length(43);

export function getId(context: Context<{ Bindings: Bindings }>, type: string) {
  const inboxId = context.req.param(`${type}Id`);
  const schema =
    type === "inbox"
      ? z.union([Base64IdSchema, z.literal("public")])
      : Base64IdSchema;
  const parsed = schema.safeParse(inboxId);
  if (!parsed.success) {
    throw new HTTPException(400, { message: `Invalid ${type}Id` });
  }
  return parsed.data;
}

function addAuthRoute(
  router: OpenAPIHono<{ Bindings: Bindings }>,
  type: string,
) {
  const authRoute = createRoute({
    method: "get",
    description: "Gets the URL of the service's authorization provider.",
    tags: [type === "inbox" ? "Inbox" : "Storage Bucket"],
    path: "/auth",
    request: {},
    responses: {
      200: {
        description: "Retrieved authorization provider URL",
        content: {
          "text/plain": { schema: z.url() },
        },
      },
    },
  });
  router.openapi(authRoute, async (c) => {
    const headers = new Headers();
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    return c.text(`gf:a:oauth2:${c.env.BASE_HOST}`, { headers });
  });
}

function disableCors(router: OpenAPIHono<{ Bindings: Bindings }>) {
  router.use("*", async (c, next) => {
    // Disable CORs
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    c.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Content-Length, Authorization, If-None-Match, Accept-Encoding",
    );
    await next();
  });
}

function addOpenAPI(router: OpenAPIHono<{ Bindings: Bindings }>, type: string) {
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

  router.get("/openapi.json", (c) => {
    const id = getId(c, type);
    const serviceUrl = serviceIdToUrl(id, type, c.env.BASE_HOST);

    const doc = router.getOpenAPIDocument({
      openapi: "3.1.0",
      info: {
        title: `Graffiti HTTPS ${
          type === "inbox" ? "Inbox" : "Storage Bucket"
        } API`,
        version: "1.0.0",
      },
      servers: [
        {
          url: `/${type === "inbox" ? "i" : "s"}/${id}`,
        },
      ],
    });

    const scope = serviceUrl;

    // Add the scope to oauth
    const oauth2 = doc.components?.securitySchemes?.["oauth2"];
    if (oauth2 && "flows" in oauth2 && oauth2.flows?.authorizationCode) {
      oauth2.flows.authorizationCode.scopes = {
        [scope]: `Access to the ${type === "inbox" ? "inbox" : "storage bucket"}`,
      };
    }

    // Require that scope for any operation that declares oauth2 security
    for (const pathItem of Object.values(doc.paths ?? {})) {
      if (!pathItem || typeof pathItem !== "object") continue;

      for (const op of Object.values(pathItem as any)) {
        if (!op || typeof op !== "object") continue;
        if (!("security" in op) || !Array.isArray(op.security)) continue;

        op.security = op.security.map((sec: any) => {
          if (!sec || typeof sec !== "object" || !("oauth2" in sec)) return sec;
          return { ...sec, oauth2: [scope] };
        });
      }
    }

    return c.json(doc);
  });

  router.get(
    "/docs",
    swaggerUI({
      url: "./openapi.json",
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
}

export function augmentService(
  router: OpenAPIHono<{ Bindings: Bindings }>,
  type: string,
) {
  disableCors(router);
  addAuthRoute(router, type);
  addOpenAPI(router, type);
}
