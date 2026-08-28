import Ajv from "ajv";
import { FileKind, fromMime } from "human-filetypes";
import type { Permission } from "./db.js";

const ajv = new Ajv({ strict: false });

export function objectMatch(
  object: any,
): Extract<Permission["match"], { kind: "object" }> {
  const schema = schemaFor(object.value);
  return {
    kind: "object",
    schema: sortJson(schema),
    channels: "any",
    allowed: "any",
  };
}

export function mediaMatch(
  subject: any,
): Extract<Permission["match"], { kind: "media" }> {
  return {
    kind: "media",
    mediaType: mediaMatchKey(subject.type),
    allowed: "any",
  };
}

/** Retain access to one previously approved read without broadening its scope. */
export function exactReadMatch(subject: any): Permission["match"] {
  if (subject.kind === "object") {
    return { kind: "object", url: exactUrl(subject.object.url) };
  }
  if (subject.kind === "media") {
    return { kind: "media", url: exactUrl(subject.url) };
  }
  throw new TypeError("Cannot create an exact permission for this request.");
}

export function matches(permission: Permission, subject: any) {
  const match = permission.match;
  if (match.kind !== subject.kind) return false;
  if (match.kind === "logout") return true;
  if (match.kind === "object") {
    if ("url" in match) return match.url === subject.object.url;
    return (
      ajv.validate(match.schema as object, subject.object.value) &&
      sameScope(match.channels, subject.object.channels) &&
      sameScope(match.allowed, subject.object.allowed)
    );
  }
  if ("url" in match) return match.url === subject.url;
  return (
    match.mediaType === mediaMatchKey(subject.type) &&
    sameScope(match.allowed, subject.allowed)
  );
}

export function normalizeObject(object: any) {
  return {
    value: cloneJson(object.value),
    channels: normalizeStrings(object.channels),
    ...(object.allowed !== undefined
      ? { allowed: normalizeStrings(object.allowed) }
      : {}),
    ...(typeof object.url === "string" ? { url: object.url } : {}),
    ...(typeof object.actor === "string" ? { actor: object.actor } : {}),
  };
}

function sameScope(expected: unknown, actual: unknown) {
  return (
    expected === "any" ||
    stableStringify(expected) === stableStringify(normalizeStrings(actual))
  );
}

function normalizeStrings(value: unknown): any {
  if (value === undefined || value === null) return value;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new TypeError("Expected an array of strings.");
  }
  return [...new Set(value)].sort();
}

function mediaMatchKey(value: unknown) {
  const type = String(value || "application/octet-stream").toLowerCase().trim();
  const kind = fromMime(type);
  return kind === FileKind.Unknown ? `mime:${type}` : `kind:${kind}`;
}

function exactUrl(value: unknown) {
  if (typeof value !== "string" || !value) {
    throw new TypeError("An exact read permission requires a URL.");
  }
  return value;
}

// Preserve the exact JSON shape and types while allowing scalar values to vary,
// except for conventional Graffiti discriminators that identify object kinds.
function schemaFor(value: any, key?: string): any {
  if (["type", "@type", "activity"].includes(key ?? "") && isScalar(value)) {
    return { const: value };
  }
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    const items = [
      ...new Map(
        value.map((item) => {
          const schema = schemaFor(item);
          return [JSON.stringify(sortJson(schema)), schema];
        }),
      ).values(),
    ];
    return {
      type: "array",
      items: items.length < 2 ? (items[0] ?? {}) : { anyOf: items },
    };
  }
  if (typeof value === "object") {
    return {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(value).map(([childKey, child]) => [
          childKey,
          schemaFor(child, childKey),
        ]),
      ),
      required: Object.keys(value).sort(),
      additionalProperties: false,
    };
  }
  return { type: typeof value === "number" ? "number" : typeof value };
}

function isScalar(value: unknown) {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function stableStringify(value: unknown) {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortJson(child)]),
  );
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
