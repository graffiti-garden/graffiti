import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Graffiti, GraffitiLoginEvent } from "@graffiti-garden/api";

vi.mock("../src/ui/show.js", () => ({ show: vi.fn() }));
vi.mock("../src/ui/ask-login.js", () => ({ askLogin: vi.fn() }));

import { handleLoginRedirect, takeLoginResult } from "../src/bootstrap/login_redirect.js";
import { show } from "../src/ui/show.js";
import { askLogin } from "../src/ui/ask-login.js";
import { LoginAccess } from "../src/core/login-access.js";
import { sourceFromContext } from "../src/core/source.js";

const nonce = "01234567-89ab-4def-8123-456789abcdef";
const appUrl = "https://app.example/chat#room";
const statePrefix = "graffiti-guard-login:";
let replace: ReturnType<typeof vi.fn>;
const cookies = new Map<string, string>();
const cookieDocument = {
  referrer: "",
  get cookie() { return [...cookies].map(([key, value]) => `${key}=${value}`).join("; "); },
  set cookie(value: string) {
    const [entry] = value.split(";");
    const index = entry.indexOf("=");
    const key = entry.slice(0, index);
    if (value.includes("Max-Age=0")) cookies.delete(key);
    else cookies.set(key, entry.slice(index + 1));
  },
};

function startUrl(id: string | undefined = nonce, redirectUrl = appUrl, state = "caller-id") {
  const url = new URL("https://guard.example/");
  const params = new URLSearchParams({ guardLogin: "1", redirectUrl, state });
  if (id) params.set("loginNonce", id);
  url.hash = params.toString();
  return url;
}

// This implementation knows only the public API. It never reads or rewrites a callback URL.
function load(url = new URL("https://guard.example/")) {
  window.location = Object.assign(new URL(url), { replace }) as unknown as Location;
  const graffiti = {
    sessionEvents: new EventTarget(),
    login: vi.fn<Graffiti["login"]>(async () => {}),
  };
  const onReady = vi.fn();
  const create = vi.fn(() => {
    expect(window.location.hash).not.toContain("guardLogin");
    return graffiti as unknown as Graffiti;
  });
  handleLoginRedirect(url, create, onReady);
  return {
    ...graffiti, create, onReady,
    get state() { return graffiti.login.mock.calls[0][0]!.state!; },
    initialize: (error?: Error) => graffiti.sessionEvents.dispatchEvent(new CustomEvent("initialized", { detail: error ? { error } : undefined })),
    emit: (detail: GraffitiLoginEvent["detail"]) => graffiti.sessionEvents.dispatchEvent(new CustomEvent("login", { detail })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(askLogin).mockReset();
  cookies.clear();
  cookieDocument.referrer = "";
  vi.stubGlobal("document", cookieDocument);
  replace = vi.fn();
  const unavailableStorage = new Proxy({}, {
    get() { throw new Error("Unexpected Web Storage access"); },
  });
  vi.stubGlobal("sessionStorage", unavailableStorage);
  vi.stubGlobal("localStorage", unavailableStorage);
  vi.stubGlobal("window", {
    sessionStorage: unavailableStorage, localStorage: unavailableStorage,
    location: Object.assign(new URL("https://guard.example/"), { replace }),
    history: { replaceState: vi.fn((_state, _title, url) => {
      window.location = Object.assign(new URL(url), { replace }) as unknown as Location;
    }) },
  });
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(["alice", undefined])("offers saved accounts after the first-party visit (choice: %s)", async choice => {
  const url = startUrl();
  const source = [{ id: "chat", name: "Chat" }];
  const params = new URLSearchParams(url.hash.slice(1));
  params.set("chooseAccount", "1");
  params.set("source", JSON.stringify(source));
  url.hash = params.toString();
  vi.mocked(askLogin).mockResolvedValue(choice);
  const page = load(url);
  page.emit({ session: { actor: "alice" } });
  page.emit({ session: { actor: "bob" } });
  page.initialize();

  await vi.waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith(appUrl));
  expect(askLogin).toHaveBeenCalledWith(expect.anything(), sourceFromContext("https://app.example", { source }), ["alice", "bob"]);
  expect(page.login).not.toHaveBeenCalled();
  expect(takeLoginResult(nonce, "https://app.example")).toEqual(choice
    ? { session: { actor: choice }, state: "caller-id", source }
    : { error: new Error("Login canceled"), state: "caller-id", source });
});

it("starts a new sign-in when Another account is chosen on the guard page", async () => {
  const url = startUrl();
  url.hash += "&chooseAccount=1&suggestedActor=alice";
  vi.mocked(askLogin).mockResolvedValue(null);
  const page = load(url);
  page.emit({ session: { actor: "alice" } });
  page.initialize();
  await vi.waitFor(() => expect(page.login).toHaveBeenCalledWith({ state: expect.any(String) }));
  expect(replace).not.toHaveBeenCalled();
});

it.each([undefined, "bob"])("starts sign-in directly if no matching saved account exists (%s)", actor => {
  const url = startUrl();
  url.hash += "&chooseAccount=1" + (actor ? `&suggestedActor=${actor}` : "");
  const page = load(url);
  if (actor) page.emit({ session: { actor: "alice" } });
  page.initialize();
  expect(askLogin).not.toHaveBeenCalled();
  expect(page.login).toHaveBeenCalledWith({ state: expect.any(String), actor });
});

it("does not repeat the chooser after Another account was chosen in the app", () => {
  const page = load(startUrl());
  page.emit({ session: { actor: "alice" } });
  page.initialize();
  expect(askLogin).not.toHaveBeenCalled();
  expect(page.login).toHaveBeenCalledWith({ state: expect.any(String), actor: undefined });
});

it("returns the chooser's cancellation in the URL for clients that support it", async () => {
  const url = startUrl();
  url.hash += "&chooseAccount=1&cancelReturn=1";
  vi.mocked(askLogin).mockResolvedValue(undefined);
  const page = load(url);
  page.emit({ session: { actor: "alice" } });
  page.initialize();
  const expected = new URL(appUrl);
  expected.searchParams.set("graffitiLoginCanceled", nonce);
  await vi.waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith(expected.href));
  expect(takeLoginResult(nonce, "https://app.example")).toBeUndefined();
  expect(page.login).not.toHaveBeenCalled();
});

it.each([true, false])("preserves the return capability through authentication reloads (failed: %s)", failed => {
  const destination = "https://app.example/view?keep=1#/v?/nested";
  const url = startUrl(nonce, destination);
  url.hash += "&cancelReturn=1";
  const first = load(url);
  first.initialize();
  const resumed = load();
  resumed.emit(failed
    ? { error: new Error("Provider declined login"), state: first.state }
    : { session: { actor: "alice" }, state: first.state });
  resumed.initialize();
  const expected = new URL(destination);
  if (failed) expected.searchParams.set("graffitiLoginCanceled", nonce);
  expect(replace).toHaveBeenCalledExactlyOnceWith(expected.href);
  expect(takeLoginResult(nonce, "https://app.example")).toEqual(failed
    ? undefined : { session: { actor: "alice" }, state: "caller-id" });
});

it.each([
  "caller-id",
  "",
  JSON.stringify({ route: "/café?filter=100%&room=#🌱" }),
])("returns caller state %j after reload without guard storage or implementation-specific URLs", appState => {
  const first = load(startUrl(nonce, appUrl, appState));
  expect(first.login).not.toHaveBeenCalled();
  first.initialize();
  expect(first.login).toHaveBeenCalledWith({ state: expect.any(String), actor: undefined });
  expect(first.onReady).not.toHaveBeenCalled();
  expect(window.location.href).toBe("https://guard.example/");
  // Neither the old guard fragment nor a recognizable authentication callback is needed.
  const resumed = load(new URL("https://guard.example/?arbitrary-callback=format"));
  resumed.emit({ session: { actor: "did:example:restored" } });
  resumed.emit({ session: { actor: "did:example:unrelated" }, state: crypto.randomUUID() });
  expect(replace).not.toHaveBeenCalled();
  resumed.emit({ session: { actor: "did:example:chosen" }, state: first.state });
  expect(replace).not.toHaveBeenCalled();
  resumed.initialize();
  resumed.initialize();
  expect(replace).toHaveBeenCalledExactlyOnceWith(appUrl);
  expect(resumed.login).not.toHaveBeenCalled();
  expect(resumed.onReady).not.toHaveBeenCalled();
  expect(takeLoginResult(nonce, "https://other.example")).toBeUndefined();
  expect(takeLoginResult(nonce, "https://app.example")).toEqual({
    session: { actor: "did:example:chosen" }, state: appState,
  });
  expect(takeLoginResult(nonce, "https://app.example")).toBeUndefined();
});

it.each([false, true])("handles results without a redirect (error=%s)", error => {
  const page = load(startUrl());
  page.initialize();
  page.emit({ error: new Error("unrelated") });
  expect(replace).not.toHaveBeenCalled();
  const detail = error ? { error: new Error("cancelled") } : { session: { actor: "did:example:chosen" } };
  page.emit({ ...detail, state: page.state });
  page.emit({ ...detail, state: page.state });
  expect(replace).toHaveBeenCalledExactlyOnceWith(appUrl);
  expect(takeLoginResult(nonce, "https://app.example")).toEqual({ ...detail, state: "caller-id" });
});

it("returns a terminal failure received before initialization", () => {
  const first = load(startUrl());
  first.initialize();
  const resumed = load();
  resumed.emit({ state: first.state, error: new Error("Login unavailable") });
  expect(replace).toHaveBeenCalledExactlyOnceWith(appUrl);
  resumed.initialize();
  expect(resumed.onReady).not.toHaveBeenCalled();
});

it("supports older clients that supply neither a nonce nor state", () => {
  const url = new URL("https://guard.example/");
  url.hash = new URLSearchParams({ guardLogin: "1", redirectUrl: appUrl }).toString();
  const first = load(url);
  first.initialize();
  const { nonce: generatedNonce } = JSON.parse(first.state.slice(statePrefix.length));
  const resumed = load();
  resumed.emit({ state: first.state, session: { actor: "did:example:chosen" } });
  resumed.initialize();
  expect(replace).toHaveBeenCalledWith(appUrl);
  expect(takeLoginResult(generatedNonce, "https://app.example")).toEqual({ session: { actor: "did:example:chosen" } });
});

it("keeps simultaneous requests independent when they finish in reverse order", () => {
  const otherId = crypto.randomUUID();
  const otherApp = "https://other.example/";
  const first = load(startUrl());
  first.initialize();
  const second = load(startUrl(otherId, otherApp));
  second.initialize();
  for (const [state, destination] of [[second.state, otherApp], [first.state, appUrl]]) {
    const page = load();
    page.emit({ state, session: { actor: "did:example:chosen" } });
    page.initialize();
    expect(replace).toHaveBeenLastCalledWith(destination);
  }
});

it.each([
  ["malformed JSON", "{"],
  ["null context", "null"],
  ["expired context", { expiresAt: 0 }],
  ["missing expiry", { expiresAt: undefined }],
  ["unsafe URL", { redirectUrl: "javascript:alert(1)" }],
  ["invalid nonce", { nonce: "not-a-nonce" }],
  ["invalid caller state", { appState: 42 }],
])("does not return using %s", (_kind, invalid) => {
  const first = load(startUrl());
  first.initialize();
  const context = JSON.parse(first.state.slice(statePrefix.length));
  const state = statePrefix + (typeof invalid === "string" ? invalid : JSON.stringify({ ...context, ...invalid }));
  const resumed = load();
  resumed.emit({ state, session: { actor: "did:example:chosen" } });
  resumed.initialize();
  expect(replace).not.toHaveBeenCalled();
  expect(resumed.onReady).not.toHaveBeenCalled();
  expect([...cookies.keys()].some(key => key.startsWith("graffiti-guard-login-result-"))).toBe(false);
  expect(show).toHaveBeenLastCalledWith(expect.anything(), { message: expect.stringContaining("expired"), loading: false });
});

it("ignores restored sessions on an ordinary visit", () => {
  const page = load();
  page.emit({ session: { actor: "did:example:restored" } });
  page.initialize();
  expect(page.onReady).toHaveBeenCalledOnce();
  expect(page.login).not.toHaveBeenCalled();
});

it("shows public initialization failures instead of opening Permissions", () => {
  const page = load();
  page.initialize(new Error("Login expired. Please start again."));
  expect(page.onReady).not.toHaveBeenCalled();
  expect(show).toHaveBeenLastCalledWith(expect.anything(), { message: "Login expired. Please start again.", loading: false });
});

it("rejects an invalid return destination before constructing the implementation", () => {
  const page = load(startUrl(nonce, "javascript:alert(1)"));
  expect(page.create).not.toHaveBeenCalled();
  expect([...cookies.keys()].some(key => key.startsWith("graffiti-guard-login-result-"))).toBe(false);
});

it("rejects receipts without a valid expiry", () => {
  cookies.set(`graffiti-guard-login-result-${nonce}`, encodeURIComponent(JSON.stringify({
    actor: "did:example:chosen", origin: "https://app.example",
  })));
  expect(takeLoginResult(nonce, "https://app.example")).toBeUndefined();
});


it.each([
  { existing: false, referrer: appUrl },
  { existing: false, referrer: "" },
  { existing: true, referrer: appUrl },
  { existing: true, referrer: "" },
])("carries the chosen account without approving an unverified destination ($existing, $referrer)", ({ existing, referrer }) => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  vi.stubGlobal("localStorage", storage);
  const access = new LoginAccess(storage);
  const previous = sourceFromContext("https://previous.example", {});
  access.grant("alice", previous);
  const source = [{ id: "room", name: "Room" }];
  const site = sourceFromContext("https://app.example", { source });
  cookieDocument.referrer = referrer;
  const url = startUrl();
  const params = new URLSearchParams(url.hash.slice(1));
  params.set("source", JSON.stringify(source));
  url.hash = params.toString();
  const first = load(url);
  if (existing) first.emit({ session: { actor: "alice" } });
  first.initialize();
  // An OAuth callback is a new document without activation. It should return
  // directly, including when the person chose an already signed-in account.
  vi.stubGlobal("navigator", { userActivation: { hasBeenActive: false } });
  const resumed = load();
  resumed.emit({ session: { actor: "alice" }, state: first.state });
  resumed.initialize();
  expect(replace).toHaveBeenCalledExactlyOnceWith(appUrl);
  expect(access.allows("alice", site)).toBe(false);
  expect(access.allows("alice", previous)).toBe(existing);
  expect(takeLoginResult(nonce, "https://app.example")).toEqual({
    session: { actor: "alice" }, state: "caller-id", source,
  });
});
