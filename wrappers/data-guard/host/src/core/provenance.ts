import { GraffitiErrorForbidden } from "@graffiti-garden/api";
import type { Source } from "./source.js";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Browser-verified origin followed by the IDs assigned by each parent to its child. */
export function siteId(source: Source): string[] {
  return [source.origin, ...source.path.map(({ id }) => id)];
}

/** Store the whole path as one string without losing the boundaries between IDs. */
export function siteKey(id: readonly string[]): string {
  return JSON.stringify(id);
}

/**
 * Read/delete access follows the site hierarchy upward: a parent may handle
 * data created by its children, but a child gains no access to its parent's data.
 * Compare whole path segments, not string prefixes or human-readable names.
 */
export function isWithinSource(source: Source, postedVia: readonly string[]) {
  const parent = siteId(source);
  return parent.length <= postedVia.length &&
    parent.every((segment, index) => segment === postedVia[index]);
}

export type SiteProvenance = { id: string[]; name?: string };

/**
 * Read an existing object's value["via site"] for permission checks and prompts.
 * Its stored ID is a JSON-encoded path; decode it so we can compare ancestors.
 * The name is only a display label, and the URL is not needed for access checks.
 * Missing or malformed stamps mean unknown origin. This parses the stamp;
 * preparePost prevents apps using the guard from supplying their own.
 */
export function viaSite(object: unknown): SiteProvenance | undefined {
  if (!isRecord(object) || !isRecord(object.value)) return undefined;
  const site = object.value["via site"];
  if (!isRecord(site) || typeof site.id !== "string") return undefined;
  try {
    const id: unknown = JSON.parse(site.id);
    return Array.isArray(id) && id.length > 0 && id.every(
      (part) => typeof part === "string" && part.length > 0,
    ) ? { id, ...(typeof site.name === "string" && site.name ? { name: site.name } : {}) } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build the value["via site"] stamp for new objects and media receipts from
 * the requesting site's Source. The ID identifies the full nested site path;
 * name and optional URL describe the innermost site for display and linking.
 * This only builds the stamp; the caller adds it to the object being posted.
 */
export function siteStamp(source: Source) {
  const segment = source.path.at(-1);
  return {
    name: segment?.name ?? new URL(source.origin).host,
    id: source.key,
    ...(segment?.url ? { url: segment.url } : {}),
  };
}

/**
 * Snapshot and stamp a post before authorization. "confirm with guard": true
 * requests approval of this exact post and stays in its value after approval.
 * This function does not approve the post; the caller handles that decision.
 */
export function preparePost(object: unknown, source: Source) {
  if (!isRecord(object) || !isRecord(object.value)) {
    throw new TypeError("A Graffiti post needs an object value.");
  }
  // Graffiti values are JSON. Snapshot the exact payload so the app cannot
  // change it while the person is reviewing a permission dialog.
  const snapshot = JSON.parse(JSON.stringify(object)) as RecordValue;
  if (!isRecord(snapshot.value)) {
    throw new TypeError("A Graffiti post needs an object value.");
  }
  const value = snapshot.value;
  // Only the guard may attribute a post to a site or mark it as a media receipt.
  if (Object.hasOwn(value, "via site") || Object.hasOwn(value, "_guard")) {
    throw new GraffitiErrorForbidden("Apps cannot set reserved guard fields.");
  }
  const confirm = value["confirm with guard"] === true;
  if (Object.hasOwn(value, "confirm with guard") && !confirm) {
    throw new TypeError('"confirm with guard" must be true when supplied.');
  }
  value["via site"] = siteStamp(source);
  return { object: snapshot, confirm };
}
