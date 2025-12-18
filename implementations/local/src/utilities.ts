import {
  GraffitiErrorInvalidSchema,
  GraffitiErrorInvalidUrl,
} from "@graffiti-garden/api";
import type {
  GraffitiObject,
  GraffitiObjectBase,
  JSONSchema,
  GraffitiSession,
  GraffitiObjectUrl,
} from "@graffiti-garden/api";
import type { Ajv } from "ajv";

export function randomBase64(numBytes: number = 32) {
  const bytes = new Uint8Array(numBytes);
  crypto.getRandomValues(bytes);
  // Convert it to base64
  const base64 = btoa(String.fromCodePoint(...bytes));
  // Make sure it is url safe
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/\=+$/, "");
}

const OBJECT_URL_PREFIX = "graffiti:object:";
export function encodeObjectUrl(actor: string, id: string) {
  return `${OBJECT_URL_PREFIX}${encodeURIComponent(actor)}:${encodeURIComponent(id)}`;
}

export function decodeObjectUrl(url: string) {
  if (!url.startsWith(OBJECT_URL_PREFIX)) {
    throw new GraffitiErrorInvalidUrl(
      `Object URL does not start with ${OBJECT_URL_PREFIX}`,
    );
  }
  const slices = url.slice(OBJECT_URL_PREFIX.length).split(":");
  if (slices.length !== 2) {
    throw new GraffitiErrorInvalidUrl(
      "Object has too many colon-seperated parts",
    );
  }
  const [actor, id] = slices.map(decodeURIComponent);
  return { actor, id };
}
