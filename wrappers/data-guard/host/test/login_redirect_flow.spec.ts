import { afterEach, beforeEach, expect, it, vi } from "vitest";

const instances: { sessionEvents: EventTarget; login: ReturnType<typeof vi.fn> }[] = [];

vi.mock("@graffiti-garden/implementation-decentralized", () => ({
  GraffitiDecentralized: class {
    sessionEvents = new EventTarget();
    login = vi.fn(async () => {});
    constructor() {
      instances.push(this);
    }
  },
}));
vi.mock("../src/ui/show.js", () => ({ show: vi.fn() }));

import {
  handleLoginRedirect,
  takeLoginResult,
} from "../src/bootstrap/login_redirect.js";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } as unknown as Storage;
}

const nonce = "01234567-89ab-4def-8123-456789abcdef";
const appUrl = "https://app.example/chat#room";
let replace: ReturnType<typeof vi.fn>;

const cookies = new Map<string, string>();
const cookieDocument = {
  get cookie() { return [...cookies].map(([key, value]) => `${key}=${value}`).join("; "); },
  set cookie(value: string) {
    const [entry] = value.split(";");
    const index = entry.indexOf("=");
    const key = entry.slice(0, index);
    if (value.includes("Max-Age=0")) cookies.delete(key);
    else cookies.set(key, entry.slice(index + 1));
  },
};

beforeEach(() => {
  cookies.clear();
  vi.stubGlobal("document", cookieDocument);
  instances.length = 0;
  replace = vi.fn();
  vi.stubGlobal("sessionStorage", memoryStorage());
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("window", { location: { replace, protocol: "https:" } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("returns only for the requested login after a guard page reload", async () => {
  const start = new URL("https://guard.example/");
  start.hash = new URLSearchParams({
    guardLogin: "1",
    redirectUrl: appUrl,
    loginNonce: nonce,
    state: "caller-id",
  }).toString();
  handleLoginRedirect(start);
  expect(instances[0].login).not.toHaveBeenCalled();
  instances[0].sessionEvents.dispatchEvent(new Event("initialized"));

  const state = instances[0].login.mock.calls[0][0].state;
  expect(typeof state).toBe("string");
  expect(state).toBe(nonce);
  // OAuth returns to a fresh guard page, where existing accounts may restore.
  handleLoginRedirect(new URL("https://guard.example/?code=callback"));
  const events = instances[1].sessionEvents;
  events.dispatchEvent(new CustomEvent("login", {
    detail: { session: { actor: "did:example:other" } },
  }));
  expect(replace).not.toHaveBeenCalled();

  events.dispatchEvent(new CustomEvent("login", {
    detail: { session: { actor: "did:example:chosen" }, state: state },
  }));
  expect(replace).not.toHaveBeenCalled();
  events.dispatchEvent(new Event("initialized"));
  expect(replace).toHaveBeenCalledWith(appUrl);
  events.dispatchEvent(new Event("initialized"));
  expect(replace).toHaveBeenCalledTimes(1);
  expect(takeLoginResult(nonce, "https://other.example")).toBeUndefined();
  expect(takeLoginResult(nonce, "https://app.example")).toEqual({
    session: { actor: "did:example:chosen" }, state: "caller-id",
  });
  expect(takeLoginResult(nonce, "https://app.example")).toBeUndefined();
});

it("rejects receipts without a valid expiry", () => {
  cookies.set(`graffiti-guard-login-result-${nonce}`, encodeURIComponent(JSON.stringify({
    actor: "did:example:chosen",
    origin: "https://app.example",
  })));
  expect(takeLoginResult(nonce, "https://app.example")).toBeUndefined();
});

it("returns a cancelled result only for the matching login", async () => {
  const start = new URL("https://guard.example/");
  start.hash = new URLSearchParams({
    guardLogin: "1",
    redirectUrl: appUrl,
    loginNonce: nonce,
    state: "caller-id",
  }).toString();
  handleLoginRedirect(start);
  instances[0].sessionEvents.dispatchEvent(new Event("initialized"));
  const state = instances[0].login.mock.calls[0][0].state;
  instances[0].sessionEvents.dispatchEvent(new CustomEvent("login", {
    detail: { error: new Error("cancelled"), manual: true },
  }));
  expect(replace).not.toHaveBeenCalled();
  instances[0].sessionEvents.dispatchEvent(new CustomEvent("login", {
    detail: { error: new Error("cancelled"), manual: true, state: state },
  }));
  expect(replace).toHaveBeenCalledWith(appUrl);
  expect(takeLoginResult(nonce, "https://app.example")).toEqual({
    error: new Error("cancelled"), state: "caller-id",
  });
});

it("returns a terminal failure with the matching request", () => {
  const start = new URL("https://guard.example/");
  start.hash = new URLSearchParams({ guardLogin: "1", redirectUrl: appUrl, loginNonce: nonce, state: "caller-id" }).toString();
  handleLoginRedirect(start);
  instances[0].sessionEvents.dispatchEvent(new Event("initialized"));
  const state = instances[0].login.mock.calls[0][0].state;
  instances[0].sessionEvents.dispatchEvent(new CustomEvent("login", {
    detail: { state, error: new Error("Login unavailable") },
  }));
  expect(takeLoginResult(nonce, "https://app.example")).toEqual({ error: new Error("Login unavailable"), state: "caller-id" });
  expect(replace).toHaveBeenCalledWith(appUrl);
});

it.each(["", "?actor="])("reopens a saved redirect without a callback (%s)", search => {
  sessionStorage.setItem("graffiti-guard-redirect-url", JSON.stringify({
    redirectUrl: appUrl, state: nonce, appState: "caller-id", expiresAt: Date.now() + 60_000,
  }));
  handleLoginRedirect(new URL(`https://guard.example/${search}`));
  instances[0].sessionEvents.dispatchEvent(new Event("initialized"));
  instances[0].sessionEvents.dispatchEvent(new Event("initialized"));
  expect(instances[0].login).toHaveBeenCalledExactlyOnceWith({ state: nonce });
});
