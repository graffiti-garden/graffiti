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

it("passes through a page URL only for the embedding origin", async () => {
  const parent = { postMessage: vi.fn() };
  let onMessage: ((event: MessageEvent) => void) | undefined;
  vi.stubGlobal("window", {
    parent,
    addEventListener: vi.fn((type, listener) => {
      if (type === "message") onMessage = listener;
    }),
  });
  const { listenToParent } = await import(
    "../src/bootstrap/protocol.js"
  );
  const connect = vi.fn();
  listenToParent(connect);

  onMessage?.({
    source: parent,
    origin: "https://app.example",
    data: {
      type: "graffiti-guard:connect",
      pageUrl: "https://app.example/page",
    },
  } as unknown as MessageEvent);

  expect(connect).toHaveBeenCalledWith(
    "https://app.example",
    "https://app.example/page",
  );
});

it("asks the connected parent to open storage setup", async () => {
  const parent = { postMessage: vi.fn() };
  let onMessage: ((event: MessageEvent) => void) | undefined;
  vi.stubGlobal("window", {
    parent,
    addEventListener: vi.fn((type, listener) => {
      if (type === "message") onMessage = listener;
    }),
  });
  const { listenToParent, requestStorageSetup } = await import(
    "../src/bootstrap/protocol.js"
  );

  requestStorageSetup("https://guard.example/?guardStorageSetup=1");
  expect(parent.postMessage).not.toHaveBeenCalled();

  listenToParent(vi.fn());
  onMessage?.({
    source: parent,
    origin: "https://app.example",
    data: { type: "graffiti-guard:connect" },
  } as unknown as MessageEvent);
  parent.postMessage.mockClear();
  requestStorageSetup("https://guard.example/?guardStorageSetup=1");

  expect(parent.postMessage).toHaveBeenCalledWith(
    {
      type: "graffiti-guard:open-storage-setup",
      url: "https://guard.example/?guardStorageSetup=1",
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
