import type { GraffitiLoginEvent } from "@graffiti-garden/api";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";
import Status from "../ui/Status.vue";
import { show } from "../ui/show.js";

const storageKey = "graffiti-guard-redirect-url";
const storageMaxAge = 10 * 60 * 1000;

export function isLoginRedirect(url: URL) {
  return url.searchParams.get("guardLogin") === "1" || getStoredUrl() !== null;
}

export async function handleLoginRedirect(url: URL) {
  const redirectUrl = getRedirectUrl(url);
  if (!redirectUrl) return status("Missing redirect URL.");
  const graffiti = new GraffitiDecentralized();
  const starting = url.searchParams.get("guardLogin") === "1";
  let initialized = false;
  let ready = false;
  const redirect = () => {
    if (!initialized || !ready) return;
    clearStoredUrl();
    window.location.assign(redirectUrl);
  };
  status(starting ? "Opening login..." : "Completing login...");
  graffiti.sessionEvents.addEventListener("login", (event) => {
    if (!(event instanceof CustomEvent)) return;
    const detail = event.detail as GraffitiLoginEvent["detail"];
    if (detail.error && !("manual" in detail && detail.manual)) return;
    // Ignore restored sessions while opening the login UI. A later manual
    // login or cancellation is what authorizes returning to the application.
    if (!initialized && starting) return;
    ready = true;
    redirect();
  });
  graffiti.sessionEvents.addEventListener("initialized", () => {
    initialized = true;
    redirect();
  });
  if (starting) {
    await graffiti.login(url.searchParams.get("suggestedActor") ?? undefined);
  }
}

export function getRedirectUrl(url: URL) {
  const encodedRedirect = url.searchParams.get("redirectUrl");
  if (encodedRedirect === null) return getStoredUrl();
  const parsedRedirect = URL.parse(encodedRedirect);
  if (
    parsedRedirect?.protocol !== "http:" &&
    parsedRedirect?.protocol !== "https:"
  ) {
    return null;
  }
  const redirectUrl = parsedRedirect.href;
  const value = JSON.stringify({
    redirectUrl,
    expiresAt: Date.now() + storageMaxAge,
  });
  sessionStorage.setItem(storageKey, value);
  localStorage.setItem(storageKey, value);
  return redirectUrl;
}

function getStoredUrl() {
  return read(sessionStorage) ?? read(localStorage);
}

function read(storage: Storage) {
  const value = storage.getItem(storageKey);
  if (!value) return null;
  try {
    const stored = JSON.parse(value);
    const parsedRedirect =
      typeof stored.redirectUrl === "string"
        ? URL.parse(stored.redirectUrl)
        : null;
    if (
      (parsedRedirect?.protocol === "http:" ||
        parsedRedirect?.protocol === "https:") &&
      typeof stored.expiresAt === "number" &&
      stored.expiresAt > Date.now()
    ) {
      return parsedRedirect.href;
    }
  } catch {}
  clearStoredUrl();
  return null;
}

function clearStoredUrl() {
  sessionStorage.removeItem(storageKey);
  localStorage.removeItem(storageKey);
}

function status(message: string) {
  show(Status, { message });
}
