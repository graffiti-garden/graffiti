import type {
  GraffitiObject,
  GraffitiObjectBase,
  GraffitiObjectUrl,
  GraffitiSession,
} from "./2-types.js";
import { GraffitiErrorInvalidSchema } from "./3-errors.js";
import type { JSONSchema } from "json-schema-to-ts";
import type Ajv from "ajv";

export function unpackObjectUrl(url: string | GraffitiObjectUrl) {
  return typeof url === "string" ? url : url.url;
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
  actor?: string | null,
): GraffitiObjectBase {
  // If the actor is the creator, return the object as is
  if (actor === object.actor) return object;

  // If there is an allowed list, mask it to only include the actor
  // (This assumes the actor is already allowed to access the object)
  const allowedMasked = object.allowed && actor ? [actor] : undefined;
  // Mask the channels to only include the channels that are being queried
  const channelsMasked = object.channels.filter((c) => channels.includes(c));

  return {
    ...object,
    ...(allowedMasked ? { allowed: allowedMasked } : {}),
    channels: channelsMasked,
  };
}

export function isMediaAcceptable(
  mediaType: string,
  acceptableMediaTypes: string[],
): boolean {
  const [type, subtype] = mediaType.toLowerCase().split(";")[0].split("/");

  if (!type || !subtype) return false;

  return acceptableMediaTypes.some((acceptable) => {
    const [accType, accSubtype] = acceptable
      .toLowerCase()
      .split(";")[0]
      .split("/");

    if (!accType || !accSubtype) return false;

    return (
      (accType === type || accType === "*") &&
      (accSubtype === subtype || accSubtype === "*")
    );
  });
}

const COMPILED_SCHEMA_CACHE_LIMIT = 128;
let ajvInitialization: Promise<Ajv> | undefined;

type CompiledSchema = {
  schema: JSONSchema;
  validator: ReturnType<Ajv["compile"]>;
};

const compiledSchemas = new Map<string, CompiledSchema>();
// AJV registers explicit identifiers for later, separately compiled $refs.
// Preserve that existing registry lifetime, including identifiers nested in
// otherwise anonymous roots. Only anonymous schemas are safe to evict.
const namedSchemas = new Map<string, CompiledSchema>();

const schemaArrayKeywords = new Set(["items", "allOf", "anyOf", "oneOf"]);
const schemaMapKeywords = new Set([
  "$defs",
  "definitions",
  "properties",
  "patternProperties",
  "dependencies",
]);
const schemaDataKeywords = new Set([
  "default",
  "enum",
  "const",
  "required",
  "maximum",
  "minimum",
  "exclusiveMaximum",
  "exclusiveMinimum",
  "multipleOf",
  "maxLength",
  "minLength",
  "pattern",
  "format",
  "maxItems",
  "minItems",
  "uniqueItems",
  "maxProperties",
  "minProperties",
]);

function hasSchemaIdentifier(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const schema = value as Record<string, unknown>;
  if (
    [schema.$id, schema.$anchor, schema.$dynamicAnchor].some(
      (id) => typeof id === "string",
    )
  ) {
    return true;
  }
  // Match AJV's schema traversal, excluding data in const/enum/default and
  // non-schema arrays. A literal object containing "$id" is not a registry.
  return Object.entries(schema).some(([keyword, child]) => {
    if (Array.isArray(child)) {
      return (
        schemaArrayKeywords.has(keyword) && child.some(hasSchemaIdentifier)
      );
    }
    if (schemaMapKeywords.has(keyword)) {
      return (
        !!child &&
        typeof child === "object" &&
        Object.values(child).some(hasSchemaIdentifier)
      );
    }
    return !schemaDataKeywords.has(keyword) && hasSchemaIdentifier(child);
  });
}

function useAjv(): Promise<Ajv> {
  if (!ajvInitialization) {
    ajvInitialization = import("ajv")
      .then(({ default: Ajv }) => new Ajv({ strict: false }))
      .catch((error) => {
        ajvInitialization = undefined;
        throw error;
      });
  }
  return ajvInitialization;
}

export async function compileGraffitiObjectSchema<Schema extends JSONSchema>(
  schema: Schema,
) {
  const ajv = await useAjv();
  try {
    const key = JSON.stringify(schema);
    let cached = namedSchemas.get(key) ?? compiledSchemas.get(key);
    if (cached) {
      // Refresh insertion order for bounded least-recently-used eviction.
      if (compiledSchemas.delete(key)) compiledSchemas.set(key, cached);
    } else {
      // Compile a snapshot: callers may mutate and reuse a schema object, and
      // AJV otherwise returns its old validator by object identity.
      const snapshot = JSON.parse(key) as JSONSchema;
      const named = hasSchemaIdentifier(snapshot);
      try {
        cached = { schema: snapshot, validator: ajv.compile(snapshot) };
      } catch (error) {
        // AJV inserts its identity entry before checking the schema itself.
        // Invalid anonymous inputs must not bypass our retention bound.
        if (!named) ajv.removeSchema(snapshot);
        throw error;
      }
      if (named) namedSchemas.set(key, cached);
      else compiledSchemas.set(key, cached);
    }
    if (compiledSchemas.size > COMPILED_SCHEMA_CACHE_LIMIT) {
      const oldestKey = compiledSchemas.keys().next().value!;
      const oldest = compiledSchemas.get(oldestKey)!;
      compiledSchemas.delete(oldestKey);
      // Bound AJV's own identity cache as well as our structural cache.
      ajv.removeSchema(oldest.schema);
    }
    // Force the validation guard because json-schema-to-ts supplies the type.
    return cached.validator as (
      data: GraffitiObjectBase,
    ) => data is GraffitiObject<Schema>;
  } catch (error) {
    throw new GraffitiErrorInvalidSchema(
      error instanceof Error ? error.message : String(error),
    );
  }
}
