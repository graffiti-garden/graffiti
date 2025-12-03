import { Hono } from "hono";
import type { Bindings } from "../env";

const dids = new Hono<{ Bindings: Bindings }>();

dids.get("/:actor/.well-known/did.json", (c) => {
  const actor = c.req.param("actor");
  return c.text(actor);
});

dids.get("/:actor/", (c) => {
  // Redirect to the DID document
  return c.redirect("/.well-known/did.json");
});

export default dids;
