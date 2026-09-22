import type { Request } from "../core/db.js";
import { mediaLabels } from "./media.js";

export function rememberDecisionLabel(request: Request) {
  const action =
    request.method === "post"
      ? "post similar data"
      : request.method === "get"
        ? "access similar private data"
        : request.method === "delete"
          ? "delete similar data"
          : request.method === "logout"
            ? "log you out"
            : mediaAction(request);
  return `Remember your decision whenever this site asks to ${action}?`;
}

function mediaAction(request: Request) {
  const item = mediaItem((request.subject as any)?.type);
  if (request.method === "postMedia") return `upload ${withArticle(item)}`;
  if (request.method === "getMedia") {
    return `access ${withArticle(`private ${item}`)}`;
  }
  if (request.method === "deleteMedia") return `delete ${withArticle(item)}`;
  return "perform a similar action";
}

function mediaItem(type: unknown) {
  const item = String(mediaLabels(type).item).toLowerCase();
  return ["audio", "font", "text"].includes(item) ? `${item} file` : item;
}

function withArticle(noun: string) {
  return `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
}
