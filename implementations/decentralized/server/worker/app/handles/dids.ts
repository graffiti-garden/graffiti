import { Hono, type Context } from "hono";
import { getOrigin, type Bindings } from "../../env";
import { HTTPException } from "hono/http-exception";
import {
  OptionalAlsoKnownAsSchema,
  OptionalServicesSchema,
  constructDidDocument,
  handleNameToDid,
} from "../../../shared/did-schemas";

const handleDids = new Hono<{ Bindings: Bindings }>();

export async function getDid(c: Context<{ Bindings: Bindings }>) {
  // Disable CORs
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET");
  c.header(
    "Access-Control-Allow-Headers",
    "Content-Type, If-None-Match, Accept-Encoding",
  );

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
  const origin = getOrigin(c);
  const host = new URL(origin).host;
  const did = handleNameToDid(handleName, host);

  return c.json(constructDidDocument({ did, services, alsoKnownAs }));
}

handleDids.get("/:handle-name/.well-known/did.json", getDid);

export default handleDids;
