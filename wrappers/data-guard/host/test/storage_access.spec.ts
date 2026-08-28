import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

function globals(requestStorageAccess: (...args: unknown[]) => Promise<unknown>) {
  vi.stubGlobal("document", {
    requestStorageAccess,
    hasStorageAccess: vi.fn().mockResolvedValue(false),
  });
  vi.stubGlobal("window", {
    parent: { postMessage: vi.fn() },
  });
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
});
