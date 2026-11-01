import type { Request } from "../core/db.js";

/** Names are for display; full IDs remain available in details. */
export function originSiteLabel(source: NonNullable<Request["originSite"]>) {
  const key = source.site;
  try {
    const ids: unknown = JSON.parse(key);
    if (
      Array.isArray(ids) &&
      ids.length > 0 &&
      ids.every((id) => typeof id === "string")
    ) {
      let origin = ids[0];
      try {
        origin = new URL(origin).host;
      } catch {
        // The verified origin is normally a URL, but keep its literal value.
      }
      if (typeof source.name === "string" && source.name) {
        return source.name === origin ? origin : `${origin} › ${source.name}`;
      }
      return ids.length === 1 ? origin : `${origin} › Unnamed site`;
    }
  } catch {
    // A malformed ID is still available in details, never used as a name.
  }
  return "Unknown site";
}

export function rememberDecisionLabel(request: Request) {
  const source = request.originSite && originSiteLabel(request.originSite);
  if (request.mode === "read" && source) {
    return `Remember this decision for all private data created on ${source}.`;
  }
  if (request.mode === "delete" && source) {
    return `Remember this decision for deletion of all objects and files created on ${source}, now and later.`;
  }
  return "";
}
