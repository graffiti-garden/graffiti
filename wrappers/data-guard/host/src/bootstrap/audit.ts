import { sourceFromContext } from "../core/source.js";
import { openAudit } from "../ui/audit.js";

export function handleAudit(url: URL) {
  const options = auditOptions(url);
  openAudit({
    ...options,
    redirectUrl: options.redirectUrl?.href,
  });
}

export function auditOptions(url: URL) {
  const fragmentParams = new URLSearchParams(url.hash.slice(1));
  const parsedRedirect = URL.parse(
    fragmentParams.get("redirectUrl") ??
      // Older clients use search searchParams
      // TODO: once clients update, delete this fix
      url.searchParams.get("redirectUrl") ??
      "",
  );
  const redirectUrl =
    parsedRedirect?.protocol === "http:" ||
    parsedRedirect?.protocol === "https:"
      ? parsedRedirect
      : undefined;
  // Older clients use search searchParams
  // TODO: once clients update, delete this fix
  const actor =
    (fragmentParams.get("actor") ?? url.searchParams.get("actor")) || undefined;
  const encodedSource =
    fragmentParams.get("source") ?? url.searchParams.get("source");
  let source;
  if (redirectUrl && encodedSource) {
    try {
      source = sourceFromContext(redirectUrl.origin, {
        source: JSON.parse(encodedSource),
      });
    } catch {}
  }
  return { source, actor, redirectUrl };
}
