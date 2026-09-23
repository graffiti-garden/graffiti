import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

function globals(
  requestStorageAccess: (...args: unknown[]) => Promise<unknown>,
  localStorage?: Storage,
) {
  const parent = { postMessage: vi.fn() };
  let onMessage: ((event: MessageEvent) => void) | undefined;
  vi.stubGlobal("document", {
    requestStorageAccess,
    hasStorageAccess: vi.fn().mockResolvedValue(false),
    visibilityState: "visible",
  });
  vi.stubGlobal("window", {
    parent,
    localStorage,
    location: { href: "https://guard.example/" },
    addEventListener: vi.fn((type, listener) => {
      if (type === "message") onMessage = listener;
    }),
    setTimeout: (...args: Parameters<typeof setTimeout>) =>
      setTimeout(...args),
  });
  return {
    parent,
    connect() {
      onMessage?.({
        source: parent,
        origin: "https://app.example",
        data: { type: "graffiti-guard:connect" },
      } as unknown as MessageEvent);
    },
  };
}

describe("storage access", () => {
  it("falls back to the untyped Storage Access API", async () => {
    const request = vi.fn(async (types?: unknown) => {
      if (types) throw new TypeError("Typed access is unsupported");
    });
    const { activateStorageAccess } = await import(
      "../src/bootstrap/storage_access.js"
    );
    globals(request);

    await activateStorageAccess();
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]).toEqual([]);
  });

  it("keeps the prompt retryable after access is denied", async () => {
    let attempts = 0;
    const request = vi.fn(async () => {
      attempts += 1;
      if (attempts < 5) throw new Error("Denied");
    });
    const [{ activateStorageAccess }, { componentState }] = await Promise.all([
      import("../src/bootstrap/storage_access.js"),
      import("../src/ui/show.js"),
    ]);
    globals(request);

    const activation = activateStorageAccess();
    await vi.waitFor(() =>
      expect(componentState.props.onContinue).toBeTypeOf("function"),
    );
    await (componentState.props.onContinue as () => Promise<void>)();
    expect(componentState.props.onContinue).toBeTypeOf("function");
    await (componentState.props.onContinue as () => Promise<void>)();

    await expect(activation).resolves.toBeUndefined();
  });

  it("remembers setup in the guard before asking its parent to navigate", async () => {
    vi.useFakeTimers();
    const storage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    } as unknown as Storage;
    const request = vi.fn().mockRejectedValue(new Error("Denied"));
    const environment = globals(request, storage);
    const [
      { activateStorageAccess },
      { listenToParent },
      { componentState },
    ] = await Promise.all([
      import("../src/bootstrap/storage_access.js"),
      import("../src/bootstrap/protocol.js"),
      import("../src/ui/show.js"),
    ]);
    listenToParent(vi.fn());
    environment.connect();
    environment.parent.postMessage.mockClear();

    void activateStorageAccess("https://app.example/page");
    await vi.waitFor(() =>
      expect(componentState.props.onContinue).toBeTypeOf("function"),
    );
    await (componentState.props.onContinue as () => Promise<void>)();

    expect(storage.setItem).toHaveBeenCalledWith(
      "graffiti-guard:storage-setup",
      "1",
    );
    expect(environment.parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "graffiti-guard:open-storage-setup" }),
      "https://app.example",
    );
  });

  it("clears the guard's saved finishing state after access succeeds", async () => {
    const storage = {
      getItem: vi.fn().mockReturnValue("1"),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    } as unknown as Storage;
    const request = vi.fn().mockResolvedValue(undefined);
    globals(request, storage);
    const { activateStorageAccess } = await import(
      "../src/bootstrap/storage_access.js"
    );

    await activateStorageAccess("https://app.example/page");

    expect(storage.getItem).toHaveBeenCalledWith(
      "graffiti-guard:storage-setup",
    );
    expect(storage.removeItem).toHaveBeenCalledWith(
      "graffiti-guard:storage-setup",
    );
  });

  it("offers to restart setup when the saved finishing state is stale", async () => {
    const storage = {
      getItem: vi.fn().mockReturnValue("1"),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    } as unknown as Storage;
    const request = vi.fn().mockRejectedValue(new Error("Denied"));
    const environment = globals(request, storage);
    const [
      { activateStorageAccess },
      { listenToParent },
      { componentState },
    ] = await Promise.all([
      import("../src/bootstrap/storage_access.js"),
      import("../src/bootstrap/protocol.js"),
      import("../src/ui/show.js"),
    ]);
    listenToParent(vi.fn());
    environment.connect();
    environment.parent.postMessage.mockClear();

    void activateStorageAccess("https://app.example/page");
    await vi.waitFor(() =>
      expect(componentState.props.onContinue).toBeTypeOf("function"),
    );
    expect(componentState.props.finishing).toBe(true);
    await (componentState.props.onContinue as () => Promise<void>)();

    expect(componentState.props).toMatchObject({
      error: true,
      finishing: true,
      setupUrl:
        "https://guard.example/?guardStorageSetup=1#redirectUrl=https%3A%2F%2Fapp.example%2Fpage",
    });
    expect(environment.parent.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "graffiti-guard:open-storage-setup" }),
      "https://app.example",
    );
  });
});
