import type { JSONSchema } from "json-schema-to-ts";
import type { Ajv } from "ajv";
import { GraffitiErrorInvalidSchema } from "./3-errors";
import type {
  GraffitiObjectBase,
  GraffitiObject,
  GraffitiObjectUrl,
  GraffitiSession,
} from "./2-types";

export function unpackObjectUrl(url: string | GraffitiObjectUrl) {
  return typeof url === "string" ? url : url.url;
}

export function compileGraffitiObjectSchema<Schema extends JSONSchema>(
  ajv: Ajv,
  schema: Schema,
) {
  try {
    // Force the validation guard because
    // it is too big for the type checker.
    // Fortunately json-schema-to-ts is
    // well tested against ajv.
    return ajv.compile(schema) as (
      data: GraffitiObjectBase,
    ) => data is GraffitiObject<Schema>;
  } catch (error) {
    throw new GraffitiErrorInvalidSchema(
      error instanceof Error ? error.message : undefined,
    );
  }
}

export function isActorAllowedGraffitiObject(
  object: GraffitiObjectBase,
  session?: GraffitiSession | null,
) {
  return (
    // If there is no allowed list, the actor is allowed.
    !Array.isArray(object.allowed) ||
    // Otherwise...
    (typeof session?.actor === "string" &&
      // The actor must be the creator of the object
      (object.actor === session.actor ||
        // Or be on the allowed list
        object.allowed.includes(session.actor)))
  );
}

export function maskGraffitiObject(
  object: GraffitiObjectBase,
  channels: string[],
  session?: GraffitiSession | null,
): void {
  // If the actor is not the creator, mask the object.
  if (object.actor !== session?.actor) {
    // If there is an allowed list, mask it to only include the actor
    // (This assumes the actor is already allowed to access the object)
    object.allowed = object.allowed && session ? [session.actor] : undefined;
    // Mask the channels to only include the channels that are being queried
    object.channels = object.channels.filter((channel) =>
      channels.includes(channel),
    );
  }
}
