import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";
import { GuardDB } from "../core/db.js";
import { Guard } from "../core/guard.js";
import { sourceFromContext } from "../core/source.js";
import { openAudit } from "../ui/audit.js";

export function handleAudit(url: URL) {
  const options = auditOptions(url);
  const graffiti = new GraffitiDecentralized();
  const guard = new Guard(
    graffiti,
    new GuardDB(),
    options.redirectUrl?.origin ?? url.origin,
    async () => false,
  );
  openAudit(guard, {
    ...options,
    redirectUrl: options.redirectUrl?.href,
  });
}

export function auditOptions(url: URL) {
  const parsedRedirect = URL.parse(
    url.searchParams.get("redirectUrl") ?? "",
  );
  const redirectUrl =
    parsedRedirect?.protocol === "http:" ||
    parsedRedirect?.protocol === "https:"
      ? parsedRedirect
      : undefined;
  const actor = url.searchParams.get("actor") || undefined;
  const encodedSource = url.searchParams.get("source");
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
