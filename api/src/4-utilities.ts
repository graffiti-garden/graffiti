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
type SchemaCompiler = (schema: JSONSchema) => ReturnType<Ajv["compile"]>;
let compilerInitialization: Promise<SchemaCompiler> | undefined;
const compiledSchemas = new Map<string, ReturnType<Ajv["compile"]>>();

function useSchemaCompiler(): Promise<SchemaCompiler> {
  if (!compilerInitialization) {
    compilerInitialization = import("ajv")
      .then(({ default: Ajv }) => {
        // Share the expensive meta-schema validator, but never register query
        // schemas in it. Each cache miss gets an isolated compiler so neither
        // identifiers nor AJV's generated-code references leak across queries.
        const metaValidator = new Ajv({ strict: false });
        return (schema: JSONSchema) => {
          metaValidator.validateSchema(schema, true);
          // The shared validator just checked the schema; do not repeat that
          // compilation in the short-lived query compiler.
          return new Ajv({ strict: false, validateSchema: false }).compile(
            schema,
          );
        };
      })
      .catch((error) => {
        compilerInitialization = undefined;
        throw error;
      });
  }
  return compilerInitialization;
}

/** Compile a self-contained schema; identifiers are local to this query. */
export async function compileGraffitiObjectSchema<Schema extends JSONSchema>(
  schema: Schema,
) {
  const compile = await useSchemaCompiler();
  try {
    const key = JSON.stringify(schema);
    let cached = compiledSchemas.get(key);
    if (cached) {
      // Refresh insertion order for bounded least-recently-used eviction.
      compiledSchemas.delete(key);
      compiledSchemas.set(key, cached);
    } else {
      // Compile a snapshot: callers may mutate and reuse a schema object, and
      // validators must keep the schema they were originally compiled from.
      const snapshot = JSON.parse(key) as JSONSchema;
      cached = compile(snapshot);
      compiledSchemas.set(key, cached);
    }
    if (compiledSchemas.size > COMPILED_SCHEMA_CACHE_LIMIT) {
      const oldestKey = compiledSchemas.keys().next().value!;
      compiledSchemas.delete(oldestKey);
    }
    // Force the validation guard because json-schema-to-ts supplies the type.
    return cached as (
      data: GraffitiObjectBase,
    ) => data is GraffitiObject<Schema>;
  } catch (error) {
    throw new GraffitiErrorInvalidSchema(
      error instanceof Error ? error.message : String(error),
    );
  }
}
