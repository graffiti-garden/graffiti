import { Hono } from "hono";
import type { Bindings } from "../env";
import { HandleSchema } from "./schemas";
import { HTTPException } from "hono/http-exception";

const handleDids = new Hono<{ Bindings: Bindings }>();

handleDids.get("/:handle/.well-known/did.json", async (c) => {
  const handle = c.req.param("handle");
  const parseResult = HandleSchema.safeParse(handle);
  if (!parseResult.success) {
    throw new HTTPException(400, {
      message: "Invalid handle.",
      cause: parseResult.error.flatten(),
    });
  }

  const result = await c.env.DB.prepare(
    "SELECT data FROM handles WHERE handle = ?",
  )
    .bind(handle)
    .first<{ data: string }>();

  if (!result) {
    throw new HTTPException(404, {
      message: "Handle not found.",
    });
  }

  return c.json(JSON.parse(result.data));
});

handleDids.get("/:handle/", (c) => {
  // Redirect to the DID document
  // TODO: replace this with a redirect to social.wiki
  return c.redirect("/.well-known/did.json");
});

export default handleDids;
