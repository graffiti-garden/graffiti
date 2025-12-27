import { Hono } from "hono";
import type { Bindings } from "../../env";
import { HTTPException } from "hono/http-exception";
import {
  OptionalAlsoKnownAsSchema,
  OptionalServicesSchema,
  constructDidDocument,
  handleNameToDid,
} from "../../../shared/did-schemas";

const handleDids = new Hono<{ Bindings: Bindings }>();

handleDids.get("/:handle-name/.well-known/did.json", async (c) => {
  const handleName = c.req.param("handle-name");

  const result = await c.env.DB.prepare(
    "SELECT services, also_known_as FROM handles WHERE name = ?",
  )
    .bind(handleName)
    .first<{ services: string; also_known_as: string }>();

  if (!result) {
    throw new HTTPException(404, {
      message: "Handle not found.",
    });
  }

  const alsoKnownAs = OptionalAlsoKnownAsSchema.parse(
    result.also_known_as ? JSON.parse(result.also_known_as) : undefined,
  );
  const services = OptionalServicesSchema.parse(
    result.services ? JSON.parse(result.services) : undefined,
  );
  const did = handleNameToDid(handleName, c.env.BASE_HOST);

  return c.json(constructDidDocument({ did, services, alsoKnownAs }));
});

handleDids.get("/:handle-name/", (c) => {
  // Redirect to the DID document
  // TODO: replace this with a redirect to social.wiki
  return c.redirect("/.well-known/did.json");
});

export default handleDids;
