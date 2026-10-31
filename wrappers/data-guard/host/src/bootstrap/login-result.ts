import type { GraffitiLoginEvent } from "@graffiti-garden/api";

type LoginResult = GraffitiLoginEvent["detail"];
const prefix = "graffiti-guard-login-result-";
const maxAge = 10 * 60;

// A one-use, origin-bound receipt bridges top-level login and the guard iframe.
// Cookies share the same Storage Access API visibility as the logged-in sessions.
export function storeLoginResult(nonce: string, origin: string, detail: LoginResult) {
  write(nonce, JSON.stringify({
    origin,
    expiresAt: Date.now() + maxAge * 1000,
    state: detail.state,
    ...(detail.error ? { error: detail.error.message } : { actor: detail.session.actor }),
  }), maxAge);
}

export function takeLoginResult(nonce: string, origin: string): LoginResult | undefined {
  if (!/^[0-9a-f-]{36}$/i.test(nonce)) return;
  const key = prefix + nonce + "=";
  const cookie = document.cookie.split(";").map(value => value.trim())
    .find(value => value.startsWith(key));
  if (!cookie) return;
  try {
    const stored = JSON.parse(decodeURIComponent(cookie.slice(key.length)));
    if (stored.origin !== origin) return;
    write(nonce, "", 0);
    if (typeof stored.expiresAt !== "number" || stored.expiresAt <= Date.now()) return;
    const state = typeof stored.state === "string" ? stored.state : undefined;
    if (typeof stored.error === "string") return { error: new Error(stored.error), state };
    if (typeof stored.actor === "string") return { session: { actor: stored.actor }, state };
  } catch {
    write(nonce, "", 0);
  }
}

function write(nonce: string, value: string, lifetime: number) {
  document.cookie = `${prefix}${nonce}=${encodeURIComponent(value)}; Max-Age=${lifetime}; Path=/; ` +
    (window.location.protocol === "https:" ? "SameSite=None; Secure" : "SameSite=Lax");
}
