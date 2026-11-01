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
  rpcEvents.length = 0;
  framesForLogin.length = 0;
  vi.unstubAllGlobals();
});

it("carries the requested login ID through a reload, only for the chosen account", async () => {
  const frames: Frame[] = [];
  const storage = memoryStorage();
  const assign = vi.fn();
  const page = Object.assign(new EventTarget(), {
    location: { href: "https://app.example/chat#room", assign },
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

  const first = new GraffitiGuarded({ hostUrl: "https://guard.example" });
  await first.login({ state: "login-42" });
  const nonce = new URLSearchParams(new URL(assign.mock.calls[0][0]).hash.slice(1))
    .get("loginNonce");
  expect(nonce).toBeTruthy();
  expect(storage.getItem("graffiti-guard-login:https://guard.example")).toBe(nonce);
  expect(new URLSearchParams(new URL(assign.mock.calls[0][0]).hash.slice(1)).get("state"))
    .toBe("login-42");
  first.destroy();

  // The app page and its iframe are recreated after the guard redirects back.
  const interrupted = new GraffitiGuarded({ hostUrl: "https://guard.example" });
  expect(storage.getItem("graffiti-guard-login:https://guard.example")).toBe(nonce);
  // Storage setup or a failed connection can reload the app before initialization.
  interrupted.destroy();
  const restored = new GraffitiGuarded({ hostUrl: "https://guard.example" });
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
  restored.destroy();

  const later = new GraffitiGuarded({ hostUrl: "https://guard.example" });
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
