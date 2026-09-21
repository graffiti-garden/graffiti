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
  expect(connect).toHaveBeenCalledWith("https://app.example");
});
