import type { Graffiti, GraffitiLoginEvent, GraffitiSessionInitializedEvent } from "@graffiti-garden/api";
import { LoginAccess } from "../core/login-access.js";
import { sourceFromContext, type Source } from "../core/source.js";
import { prepareStorage } from "./storage_setup.js";
import { storeLoginResult } from "./login-result.js";
export { takeLoginResult } from "./login-result.js";
import Status from "../ui/Status.vue";
import { show } from "../ui/show.js";

const redirectMaxAge = 10 * 60 * 1000;
const statePrefix = "graffiti-guard-login:";
const noncePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Redirect = {
  nonce: string;
  redirectUrl: string;
  appState?: string;
  expiresAt: number;
  source?: Source["path"];
  initialActors?: string[];
  fromSite?: boolean;
};

/** Install on every standalone visit: login results identify their own return destination. */
export function handleLoginRedirect(
  url: URL,
  createGraffiti: () => Graffiti,
  onReady: () => void,
) {
  const params = new URLSearchParams(url.hash.slice(1));
  let login: Parameters<Graffiti["login"]>[0];
  let starting: Redirect | undefined;
  if (params.get("guardLogin") === "1") {
    const redirectUrl = getRedirectUrl(url);
    if (!redirectUrl) return status("Login expired or missing return URL. Please start again.");
    const nonce = params.get("loginNonce");
    // The implementation carries this opaque return context through its login flow.
    let source: Source["path"] | undefined;
    try {
      if (params.has("source")) source = sourceFromContext(new URL(redirectUrl).origin, {
        source: JSON.parse(params.get("source")!),
      }).path;
    } catch { return status("Invalid login site."); }
    starting = {
      nonce: nonce && noncePattern.test(nonce) ? nonce : crypto.randomUUID(),
      redirectUrl,
      appState: params.get("state") ?? undefined,
      expiresAt: Date.now() + redirectMaxAge,
      source,
      fromSite: URL.parse(document.referrer ?? "")?.origin === new URL(redirectUrl).origin,
    };
    login = { actor: params.get("suggestedActor") || undefined };
    // Consume the start instruction before the implementation can save this page's URL.
    const cleanUrl = new URL(url);
    cleanUrl.hash = "";
    window.history.replaceState({}, "", cleanUrl.href);
  }

  if (starting) prepareStorage(url);
  const restoredActors = new Set<string>();
  const graffiti = createGraffiti();
  let initialized = false;
  let finished = false;
  let result: GraffitiLoginEvent["detail"] | undefined;
  const finish = () => {
    if (finished || !result || (!initialized && !result.error)) return;
    const redirect = readRedirect(result.state!);
    finished = true;
    if (!redirect) return status("Login expired or missing return URL. Please start again.");
    if (!result.error && redirect.source && redirect.initialActors) {
      const access = new LoginAccess(localStorage);
      if (!redirect.initialActors.includes(result.session.actor)) {
        access.clear(result.session.actor);
      }
      // Completing the explicit sign-in flow approves this site even when the
      // person chooses an account that was already signed in elsewhere.
      if (redirect.fromSite) access.grant(result.session.actor,
        sourceFromContext(new URL(redirect.redirectUrl).origin, { source: redirect.source }));
    }
    prepareStorage(url);
    storeLoginResult(redirect.nonce, new URL(redirect.redirectUrl).origin, {
      ...result, state: redirect.appState,
      ...(redirect.source ? { source: redirect.source } : {}),
    });
    // Sign-in already provided the first-party interaction. The callback is a
    // new document; its lack of user activation does not require another click.
    window.location.replace(redirect.redirectUrl);
  };
  status(login ? "Opening login" : "Loading", true);
  graffiti.sessionEvents.addEventListener("login", (event) => {
    if (!(event instanceof CustomEvent) || finished) return;
    const detail = event.detail as GraffitiLoginEvent["detail"];
    if (starting && !initialized && !detail.error && detail.state === undefined) {
      restoredActors.add(detail.session.actor);
    }
    // Only our namespaced state describes a return to an app.
    if (!detail.state?.startsWith(statePrefix)) return;
    result = detail;
    finish();
  });
  graffiti.sessionEvents.addEventListener("initialized", (event) => {
    initialized = true;
    finish();
    if (finished) return;
    const error = (event as GraffitiSessionInitializedEvent).detail?.error;
    if (error) return status(error.message);
    if (login && starting) {
      if (starting.source) starting.initialActors = [...restoredActors];
      void graffiti.login({ ...login, state: statePrefix + JSON.stringify(starting) });
    }
    else onReady();
  }, { once: true });
}

export function getRedirectUrl(url: URL) {
  const params = new URLSearchParams(url.hash.slice(1));
  return httpUrl(params.get("redirectUrl"));
}

function httpUrl(value: unknown) {
  const url = typeof value === "string" ? URL.parse(value) : null;
  return url?.protocol === "http:" || url?.protocol === "https:" ? url.href : null;
}

function readRedirect(state: string): Redirect | undefined {
  try {
    const record = JSON.parse(state.slice(statePrefix.length));
    const redirectUrl = httpUrl(record?.redirectUrl);
    if (redirectUrl && typeof record.nonce === "string" && noncePattern.test(record.nonce) &&
        Number.isFinite(record.expiresAt) && record.expiresAt > Date.now() &&
        (record.appState === undefined || typeof record.appState === "string")) {
      const source = record.source === undefined ? undefined :
        sourceFromContext(new URL(redirectUrl).origin, { source: record.source }).path;
      if (record.initialActors !== undefined && (!Array.isArray(record.initialActors) ||
          !record.initialActors.every((actor: unknown) => typeof actor === "string"))) return;
      return { ...record, redirectUrl, source };
    }
  } catch { /* Ignore malformed return state. */ }
}

function status(message: string, loading = false) {
  show(Status, { message, loading });
}
