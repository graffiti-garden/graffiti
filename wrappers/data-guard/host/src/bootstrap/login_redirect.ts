import type { GraffitiLoginEvent } from "@graffiti-garden/api";
import { storeLoginResult } from "./login-result.js";
export { takeLoginResult } from "./login-result.js";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";
import Status from "../ui/Status.vue";
import { show } from "../ui/show.js";

const storageKey = "graffiti-guard-redirect-url";
const storageMaxAge = 10 * 60 * 1000;
const noncePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Redirect = {
  redirectUrl: string;
  expiresAt: number;
  state?: string;
  appState?: string;
};

export function isLoginRedirect(url: URL) {
  return (
    new URLSearchParams(url.hash.slice(1)).get("guardLogin") === "1" ||
    getStoredRedirect() !== null
  );
}

export function handleLoginRedirect(url: URL) {
  const redirect = getRedirect(url);
  if (!redirect) return status("Missing redirect URL.");
  const { redirectUrl, state, appState } = redirect;
  if (!state) return status("Login expired. Please start again.");
  const graffiti = new GraffitiDecentralized({
    replaceInitialLoginHistoryEntry: true,
  });
  const fragmentParams = new URLSearchParams(url.hash.slice(1));
  // The decentralized client resumes account creation and OAuth callbacks
  // itself. Opening the login modal here briefly shows it over that redirect.
  const starting = !isLoginCallback(url);
  let initialized = false;
  let finished = false;
  let result: GraffitiLoginEvent["detail"] | undefined;
  const returnToApp = (loginResult: GraffitiLoginEvent["detail"]) => {
    if (finished) return;
    finished = true;
    storeLoginResult(state, new URL(redirectUrl).origin, { ...loginResult, state: appState });
    clearStoredRedirect();
    window.location.replace(redirectUrl);
  };
  const finish = () => {
    if (!initialized || !result) return;
    returnToApp(result);
  };
  status(starting ? "Opening login" : "Completing login", true);
  graffiti.sessionEvents.addEventListener("login", (event) => {
    if (!(event instanceof CustomEvent)) return;
    const detail = event.detail as GraffitiLoginEvent["detail"];
    // Restored sessions are not the login that opened this guard page.
    if (detail.state !== state) return;
    if (detail.error) {
      returnToApp(detail);
      return;
    }
    result = detail;
    finish();
  });
  graffiti.sessionEvents.addEventListener("initialized", () => {
    initialized = true;
    finish();
    if (!starting) return;
    const actor = fragmentParams.get("suggestedActor") ?? undefined;
    // Restored sessions have finished before this dialog opens.
    void graffiti.login({ ...(actor ? { actor } : {}), state });
  }, { once: true });
}

export function getRedirectUrl(url: URL) {
  return getRedirect(url)?.redirectUrl ?? null;
}

function getRedirect(url: URL): Redirect | null {
  const encodedRedirect = new URLSearchParams(url.hash.slice(1)).get("redirectUrl");
  if (encodedRedirect === null) return getStoredRedirect();
  const parsedRedirect = URL.parse(encodedRedirect);
  if (
    parsedRedirect?.protocol !== "http:" &&
    parsedRedirect?.protocol !== "https:"
  ) {
    return null;
  }
  const redirectUrl = parsedRedirect.href;
  // Callbacks can retain the original login parameters. Reuse the saved
  // request instead of treating the return as a new login.
  const stored = getStoredRedirect();
  if (
    stored?.redirectUrl === redirectUrl &&
    isLoginCallback(url)
  ) {
    return stored;
  }
  const nonce = new URLSearchParams(url.hash.slice(1)).get("loginNonce");
  const redirect: Redirect = {
    redirectUrl,
    expiresAt: Date.now() + storageMaxAge,
    state: nonce && noncePattern.test(nonce) ? nonce : crypto.randomUUID(),
    appState: new URLSearchParams(url.hash.slice(1)).get("state") ?? undefined,
  };
  const value = JSON.stringify(redirect);
  sessionStorage.setItem(storageKey, value);
  return redirect;
}

function isLoginCallback(url: URL) {
  const params = url.searchParams;
  return !!params.get("actor") || params.has("code") || params.has("error");
}

function getStoredRedirect(): Redirect | null {
  const value = sessionStorage.getItem(storageKey);
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
      return {
        redirectUrl: parsedRedirect.href,
        expiresAt: stored.expiresAt,
        ...(typeof stored.state === "string" ? { state: stored.state } : {}),
        ...(typeof stored.appState === "string" ? { appState: stored.appState } : {}),
      };
    }
  } catch {}
  clearStoredRedirect();
  return null;
}

function clearStoredRedirect() {
  sessionStorage.removeItem(storageKey);
}

function status(message: string, loading = false) {
  show(Status, { message, loading });
}
