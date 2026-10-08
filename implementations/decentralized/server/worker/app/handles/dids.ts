import { Hono, type Context } from "hono";
import { getOrigin, type Bindings } from "../../env";
import { HTTPException } from "hono/http-exception";
import {
  constructDidDocument,
  localNameToDid,
} from "../../../shared/did-schemas";

const handleDids = new Hono<{ Bindings: Bindings }>();

export async function getDid(c: Context<{ Bindings: Bindings }>) {
  c.header(
    "Cache-Control",
    "public, max-age=3600, stale-while-revalidate=86400",
  );
  const localName = c.req.param("local-name");
  if (!localName) {
    throw new HTTPException(400, {
      message: "Handle is required.",
    });
  }

  const result = await c.env.DB.prepare(
    `SELECT actors.did AS actor FROM handles
     LEFT JOIN actors ON actors.user_id = handles.user_id
     WHERE handles.identifier = ?`,
  )
    .bind(localName)
    .first<{ actor: string | null }>();

  if (!result) {
    throw new HTTPException(404, {
      message: "Handle not found.",
    });
  }

  const origin = getOrigin(c);
  const requestHost = new URL(origin).host;
  // Subdomain requests already include the handle in their host name.
  const host = requestHost.endsWith(`.${c.env.BASE_HOST}`)
    ? c.env.BASE_HOST
    : requestHost;
  const did = localNameToDid(localName, host);

  // The handle points to this account's actor; the actor's PLC document holds
  // the service endpoints.
  return c.json(constructDidDocument({
    did,
    services: undefined,
    alsoKnownAs: result.actor ? [result.actor] : undefined,
  }));
}

handleDids.get("/:local-name/.well-known/did.json", getDid);

export default handleDids;
