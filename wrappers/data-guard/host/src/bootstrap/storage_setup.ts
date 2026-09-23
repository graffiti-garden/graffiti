import StorageAccess from "../ui/StorageAccess.vue";
import Status from "../ui/Status.vue";
import { show } from "../ui/show.js";

const setupParameter = "guardStorageSetup";

export function isStorageSetup(url: URL) {
  return url.searchParams.get(setupParameter) === "1";
}

export function handleStorageSetup(url: URL) {
  const redirectUrl = parseUrl(
    new URLSearchParams(url.hash.slice(1)).get("redirectUrl"),
  );
  if (
    redirectUrl?.protocol !== "http:" &&
    redirectUrl?.protocol !== "https:"
  ) {
    show(Status, { message: "Missing app URL." });
    return;
  }

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `graffiti-guard-storage-setup=1; Max-Age=31536000; Path=/` +
    `; SameSite=${secure ? "None" : "Lax"}${secure}`;
  show(StorageAccess, { setup: true, redirectUrl: redirectUrl.href });
}

function parseUrl(value: string | null) {
  if (!value) return;
  try {
    return new URL(value);
  } catch {}
}
