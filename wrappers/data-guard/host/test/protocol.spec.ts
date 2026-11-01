import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("acknowledges the embedding origin before connecting", async () => {
  const parent = { postMessage: vi.fn() };
  let onMessage: ((event: MessageEvent) => void) | undefined;
  vi.stubGlobal("window", {
    parent,
    addEventListener: vi.fn((type, listener) => {
      if (type === "message") onMessage = listener;
    }),
  });
  const connect = vi.fn();
  const { listenToParent } = await import("../src/bootstrap/protocol.js");
  listenToParent(connect);

  onMessage?.({
    source: parent,
    origin: "https://app.example",
    data: { type: "graffiti-guard:connect" },
  } as unknown as MessageEvent);

  expect(parent.postMessage).toHaveBeenCalledWith(
    { type: "graffiti-guard:connected" },
    "https://app.example",
  );
  expect(connect).toHaveBeenCalledWith("https://app.example", undefined);
});

it("passes a login nonce only from the verified embedding parent", async () => {
  const parent = { postMessage: vi.fn() };
  let onMessage: ((event: MessageEvent) => void) | undefined;
  vi.stubGlobal("window", {
    parent,
    addEventListener: vi.fn((type, listener) => {
      if (type === "message") onMessage = listener;
    }),
  });
  const { listenToParent } = await import("../src/bootstrap/protocol.js");
  const connect = vi.fn();
  listenToParent(connect);

  onMessage?.({
    source: parent,
    origin: "https://app.example",
    data: { type: "graffiti-guard:connect", loginNonce: "nonce" },
  } as unknown as MessageEvent);

  expect(connect).toHaveBeenCalledWith(
    "https://app.example",
    "nonce",
  );
});

it("asks the connected parent to start a login redirect", async () => {
  const parent = { postMessage: vi.fn() };
  let onMessage: ((event: MessageEvent) => void) | undefined;
  vi.stubGlobal("window", {
    parent,
    addEventListener: vi.fn((type, listener) => {
      if (type === "message") onMessage = listener;
    }),
  });
  const { listenToParent, requestLoginRedirect } = await import(
    "../src/bootstrap/protocol.js"
  );

  requestLoginRedirect({ state: "request-state" });
  expect(parent.postMessage).not.toHaveBeenCalled();

  listenToParent(vi.fn());
  onMessage?.({
    source: parent,
    origin: "https://app.example",
    data: { type: "graffiti-guard:connect" },
  } as unknown as MessageEvent);
  parent.postMessage.mockClear();
  requestLoginRedirect({ state: "request-state" });

  expect(parent.postMessage).toHaveBeenCalledWith(
    {
      type: "graffiti-guard:open-login",
      options: { state: "request-state" },
    },
    "https://app.example",
  );
});

it("announces when the parent has made the guard visible", async () => {
  const parent = { postMessage: vi.fn() };
  let onMessage: ((event: MessageEvent) => void) | undefined;
  vi.stubGlobal("window", {
    parent,
    addEventListener: vi.fn((type, listener) => {
      if (type === "message") onMessage = listener;
    }),
  });
  const { listenToParent, visibilityEvents } = await import(
    "../src/bootstrap/protocol.js"
  );
  const shown = vi.fn();
  visibilityEvents.addEventListener("shown", shown);
  listenToParent(vi.fn());

  onMessage?.({
    source: parent,
    origin: "https://app.example",
    data: { type: "graffiti-guard:connect" },
  } as unknown as MessageEvent);
  onMessage?.({
    source: parent,
    origin: "https://app.example",
    data: { type: "graffiti-guard:shown" },
  } as unknown as MessageEvent);

  expect(shown).toHaveBeenCalledOnce();
});
