import { afterEach, expect, it, vi } from "vitest";

const rpcEvents: EventTarget[] = [];
const framesForLogin: Frame[] = [];
vi.mock("@graffiti-garden/wrapper-iframe-rpc/client", () => ({
  GraffitiRpcClient: class {
    sessionEvents = new EventTarget();
    destroy = vi.fn();
    login = vi.fn(async (options) => {
      window.dispatchEvent(Object.assign(new Event("message"), {
        source: framesForLogin.at(-1)!.contentWindow, origin: "https://guard.example",
        data: { type: "graffiti-guard:open-login", options },
      }));
    });
    constructor() {
      rpcEvents.push(this.sessionEvents);
    }
  },
}));

import { GraffitiGuarded } from "../../client/src/index.js";

let lastGuarded: GraffitiGuarded | undefined;
function createGuarded() {
  return lastGuarded = new GraffitiGuarded({ hostUrl: "https://guard.example" });
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

class Frame extends EventTarget {
  title = "";
  allow = "";
  src = "";
  style: Record<string, string> = {};
  sandbox = { add: vi.fn() };
  contentWindow = { postMessage: vi.fn() };
  setAttribute = vi.fn();
  remove = vi.fn();
}

afterEach(() => {
  lastGuarded?.destroy();
  lastGuarded = undefined;
  rpcEvents.length = 0;
  framesForLogin.length = 0;
  vi.unstubAllGlobals();
});

function setup(url = "https://app.example/chat#room") {
  const frames: Frame[] = [];
  const storage = memoryStorage();
  const assign = vi.fn();
  const page = Object.assign(new EventTarget(), {
    location: { href: url, assign },
    history: {
      state: { app: "navigation state" },
      replaceState: vi.fn((_state, _title, url: string) => { page.location.href = url; }),
    },
    setTimeout: vi.fn(() => 1),
    clearTimeout: vi.fn(),
    alert: vi.fn(),
  });
  vi.stubGlobal("window", page);
  vi.stubGlobal("sessionStorage", storage);
  vi.stubGlobal("CSS", { supports: () => true });
  vi.stubGlobal("document", {
    baseURI: page.location.href,
    createElement: () => {
      const frame = new Frame();
      frames.push(frame);
      framesForLogin.push(frame);
      return frame;
    },
    body: { append: vi.fn() },
  });
  return { frames, storage, assign, page };
}

it("carries the requested login ID through a reload, only for the chosen account", async () => {
  const { frames, storage, assign } = setup();
  const first = createGuarded();
  await first.login({ state: "login-42" });
  const nonce = new URLSearchParams(new URL(assign.mock.calls[0][0]).hash.slice(1))
    .get("loginNonce");
  expect(nonce).toBeTruthy();
  expect(storage.getItem("graffiti-guard-login:https://guard.example")).toBe(nonce);
  expect(new URLSearchParams(new URL(assign.mock.calls[0][0]).hash.slice(1)).get("state"))
    .toBe("login-42");
  first.destroy();

  // The app page and its iframe are recreated after the guard redirects back.
  const interrupted = createGuarded();
  expect(storage.getItem("graffiti-guard-login:https://guard.example")).toBe(nonce);
  // Storage setup or a failed connection can reload the app before initialization.
  interrupted.destroy();
  const restored = createGuarded();
  frames[2].dispatchEvent(new Event("load"));
  expect(frames[2].contentWindow.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ loginNonce: nonce }),
    "https://guard.example",
  );
  const seen: { session: { actor: string }; state?: string }[] = [];
  restored.sessionEvents.addEventListener("login", (event) => {
    seen.push((event as CustomEvent).detail);
  });
  // A completion is explicit; the order of ordinary restored sessions is irrelevant.
  rpcEvents[2].dispatchEvent(new CustomEvent("login", {
    detail: { session: { actor: "actor-A" } },
  }));
  const completion = { session: { actor: "actor-B" }, state: "login-42" };
  rpcEvents[2].dispatchEvent(new CustomEvent("login", { detail: completion }));
  expect(seen.map(({ session, state }) => [session.actor, state])).toEqual([
    ["actor-A", undefined],
    ["actor-B", "login-42"],
  ]);
  rpcEvents[2].dispatchEvent(new CustomEvent("initialized"));
  expect(storage.getItem("graffiti-guard-login:https://guard.example")).toBeNull();
  expect(storage.getItem("graffiti-guard-login:https://guard.example:return")).toBeNull();
  restored.destroy();

  const later = createGuarded();
  const laterEvents: CustomEvent[] = [];
  later.sessionEvents.addEventListener("login", (event) => {
    laterEvents.push(event as CustomEvent);
  });
  rpcEvents[3].dispatchEvent(new CustomEvent("login", {
    detail: { session: { actor: "actor-B" } },
  }));
  expect(laterEvents[0].detail.state).toBeUndefined();
  later.destroy();
});

it.each([undefined, "", "nested request: café / ? #"])("returns cancellation without cookies and preserves state through another reload (%s)", async state => {
  const originalUrl = "https://app.example/chat?x=a%20b&x=~&graffitiLoginCanceled=app-value#/v?/nested";
  const { frames, storage, assign, page } = setup(originalUrl);
  const key = "graffiti-guard-login:https://guard.example";
  const first = createGuarded();
  await first.login({ state });
  const params = new URLSearchParams(new URL(assign.mock.calls[0][0]).hash.slice(1));
  expect(params.get("cancelReturn")).toBe("1");
  const nonce = params.get("loginNonce")!;
  first.destroy();

  const callback = new URL(originalUrl);
  callback.searchParams.set("graffitiLoginCanceled", nonce);
  page.location.href = callback.href;
  const cancelled = createGuarded();
  frames[1].dispatchEvent(new Event("load"));
  expect(frames[1].contentWindow.postMessage).toHaveBeenCalledWith({
    type: "graffiti-guard:connect", loginCancelled: { state },
  }, "https://guard.example");
  expect(page.history.replaceState).toHaveBeenCalledWith(page.history.state, "", originalUrl);
  expect(page.location.href).toBe(originalUrl);
  cancelled.destroy();

  // A reload before the guard connects must not lose the cancellation result.
  const restored = createGuarded();
  frames[2].dispatchEvent(new Event("load"));
  expect(frames[2].contentWindow.postMessage).toHaveBeenCalledWith({
    type: "graffiti-guard:connect", loginCancelled: { state },
  }, "https://guard.example");
  rpcEvents[2].dispatchEvent(new CustomEvent("initialized"));
  expect(storage.getItem(key)).toBeNull();
  expect(storage.getItem(key + ":return")).toBeNull();
  // Reloading just the iframe must not replay a cancellation already delivered.
  frames[2].contentWindow.postMessage.mockClear();
  frames[2].dispatchEvent(new Event("load"));
  expect(frames[2].contentWindow.postMessage).toHaveBeenCalledWith({ type: "graffiti-guard:connect" }, "https://guard.example");
  restored.destroy();

  const later = createGuarded();
  frames[3].dispatchEvent(new Event("load"));
  expect(frames[3].contentWindow.postMessage).toHaveBeenCalledWith({ type: "graffiti-guard:connect" }, "https://guard.example");
  later.destroy();
});

it("does not cancel a newer request with an older return marker", async () => {
  const { frames, storage, page } = setup();
  const key = "graffiti-guard-login:https://guard.example";
  const first = createGuarded();
  await first.login({ state: "old" });
  const oldNonce = storage.getItem(key)!;
  await first.login({ state: "new" });
  const newNonce = storage.getItem(key)!;
  first.destroy();

  const callback = new URL(page.location.href);
  callback.searchParams.set("graffitiLoginCanceled", oldNonce);
  page.location.href = callback.href;
  const returned = createGuarded();
  frames[1].dispatchEvent(new Event("load"));
  expect(frames[1].contentWindow.postMessage).toHaveBeenCalledWith({
    type: "graffiti-guard:connect", loginNonce: newNonce,
  }, "https://guard.example");
  expect(page.history.replaceState).not.toHaveBeenCalled();
  returned.destroy();
});

it("keeps the old return flow for an in-flight login without saved cancellation context", () => {
  const { frames, storage } = setup();
  storage.setItem("graffiti-guard-login:https://guard.example", "old-nonce");
  const returned = createGuarded();
  frames[0].dispatchEvent(new Event("load"));
  expect(frames[0].contentWindow.postMessage).toHaveBeenCalledWith({
    type: "graffiti-guard:connect", loginNonce: "old-nonce",
  }, "https://guard.example");
  returned.destroy();
});
