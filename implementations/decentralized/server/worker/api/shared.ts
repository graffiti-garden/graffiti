import type { Bindings } from "../env";
import { type OpenAPIHono, z, createRoute } from "@hono/zod-openapi";

export const Base64IdSchema = z.base64url().length(43);

export function addAuthRoute(
  router: OpenAPIHono<{ Bindings: Bindings }>,
  tag: string,
  idName: string,
) {
  const authRoute = createRoute({
    method: "get",
    description: "Gets the URL of the authorization provider.",
    tags: [tag],
    path: `/{${idName}}/auth`,
    request: {
      params: z.object({
        [idName]: Base64IdSchema,
      }),
    },
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

export function disableCors(router: OpenAPIHono<{ Bindings: Bindings }>) {
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
