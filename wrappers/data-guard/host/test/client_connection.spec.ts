import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@graffiti-garden/wrapper-iframe-rpc/client", () => ({
  GraffitiRpcClient: class {
    sessionEvents = new EventTarget();
    destroy = vi.fn();
  },
}));
vi.mock("../../client/src/connection-notice.js", () => ({
  createConnectionNotice: vi.fn(() => ({ remove: vi.fn() })),
}));

import { GraffitiGuarded } from "../../client/src/index.js";
import { createConnectionNotice } from "../../client/src/connection-notice.js";

let guarded: GraffitiGuarded;
let frame: { contentWindow: { postMessage: ReturnType<typeof vi.fn> } };

function message(data: object, origin = "https://guard.example") {
  window.dispatchEvent(Object.assign(new Event("message"), {
    source: frame.contentWindow, origin, data,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  const page = Object.assign(new EventTarget(), {
    location: { href: "https://app.example/", assign: vi.fn(), reload: vi.fn() },
    setTimeout, clearTimeout, alert: vi.fn(),
  });
  frame = Object.assign(new EventTarget(), {
    style: {}, sandbox: { add: vi.fn() }, contentWindow: { postMessage: vi.fn() },
    setAttribute: vi.fn(), remove: vi.fn(),
  });
  vi.stubGlobal("window", page);
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  vi.stubGlobal("CSS", { supports: () => true });
  vi.stubGlobal("document", { baseURI: page.location.href, createElement: () => frame, body: { append: vi.fn() } });
  guarded = new GraffitiGuarded({ hostUrl: "https://guard.example" });
});

afterEach(() => {
  guarded.destroy();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("shows a nonblocking notice after 20 seconds, and removes it when connected", () => {
  vi.advanceTimersByTime(19_999);
  expect(createConnectionNotice).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(createConnectionNotice).toHaveBeenCalledExactlyOnceWith(new URL("https://guard.example"));
  expect(window.alert).not.toHaveBeenCalled();
  const notice = vi.mocked(createConnectionNotice).mock.results[0].value;
  message({ type: "graffiti-guard:connected" }, "https://unrelated.example");
  expect(notice.remove).not.toHaveBeenCalled();
  message({ type: "graffiti-guard:connected" });
  expect(notice.remove).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(20_000);
  expect(createConnectionNotice).toHaveBeenCalledOnce();
});

it("cleans up a displayed notice on destruction", () => {
  vi.advanceTimersByTime(20_000);
  expect(window.location.reload).not.toHaveBeenCalled();
  const notice = vi.mocked(createConnectionNotice).mock.results[0].value;
  guarded.destroy();
  expect(notice.remove).toHaveBeenCalledOnce();
});

it.each(["connected", "destroyed"])("never shows the notice when already %s", action => {
  if (action === "connected") message({ type: "graffiti-guard:connected" });
  else guarded.destroy();
  vi.advanceTimersByTime(20_000);
  expect(createConnectionNotice).not.toHaveBeenCalled();
});

it.each([true, undefined])("carries the account-choice instruction through the redirect (%s)", chooseAccount => {
  message({ type: "graffiti-guard:open-login", options: { state: "caller", chooseAccount } });
  const url = new URL(vi.mocked(window.location.assign).mock.calls[0][0]);
  const params = new URLSearchParams(url.hash.slice(1));
  expect(params.get("chooseAccount")).toBe(chooseAccount ? "1" : null);
  expect(params.get("state")).toBe("caller");
  expect(sessionStorage.setItem).toHaveBeenCalledWith("graffiti-guard-login:https://guard.example", params.get("loginNonce"));
});
