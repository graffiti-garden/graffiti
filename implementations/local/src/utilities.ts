import {
  GraffitiErrorInvalidSchema,
  GraffitiErrorInvalidUri,
  GraffitiErrorPatchError,
  GraffitiErrorPatchTestFailed,
} from "@graffiti-garden/api";
import type {
  GraffitiObject,
  GraffitiObjectBase,
  GraffitiPatch,
  JSONSchema,
  GraffitiSession,
  GraffitiObjectUrl,
} from "@graffiti-garden/api";
import type { Ajv } from "ajv";
import type { applyPatch } from "fast-json-patch";

export function unpackObjectUrl(url: string | GraffitiObjectUrl) {
  return typeof url === "string" ? url : url.url;
}

export function randomBase64(numBytes: number = 24) {
  const bytes = new Uint8Array(numBytes);
  crypto.getRandomValues(bytes);
  // Convert it to base64
  const base64 = btoa(String.fromCodePoint(...bytes));
  // Make sure it is url safe
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/\=+$/, "");
}

export function applyGraffitiPatch<Prop extends keyof GraffitiPatch>(
  apply: typeof applyPatch,
  prop: Prop,
  patch: GraffitiPatch,
  object: GraffitiObjectBase,
): void {
  const ops = patch[prop];
  if (!ops || !ops.length) return;
  try {
    object[prop] = apply(object[prop], ops, true, false).newDocument;
  } catch (e) {
    if (
      typeof e === "object" &&
      e &&
      "name" in e &&
      typeof e.name === "string" &&
      "message" in e &&
      typeof e.message === "string"
    ) {
      if (e.name === "TEST_OPERATION_FAILED") {
        throw new GraffitiErrorPatchTestFailed(e.message);
      } else {
        throw new GraffitiErrorPatchError(e.name + ": " + e.message);
      }
    } else {
      throw e;
    }
  }
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

export function maskGraffitiObject(
  object: GraffitiObjectBase,
  channels: string[],
  session?: GraffitiSession | null,
): void {
  if (object.actor !== session?.actor) {
    object.allowed = object.allowed && session ? [session.actor] : undefined;
    object.channels = object.channels.filter((channel) =>
      channels.includes(channel),
    );
  }
}
export function isActorAllowedGraffitiObject(
  object: GraffitiObjectBase,
  session?: GraffitiSession | null,
) {
  return (
    object.allowed === undefined ||
    object.allowed === null ||
    (!!session?.actor &&
      (object.actor === session.actor ||
        object.allowed.includes(session.actor)))
  );
}
