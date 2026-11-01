import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activateStorageAccess, restoreStorageAccess } from "../src/bootstrap/storage_access.js";
import { setVisible } from "../src/bootstrap/protocol.js";
import StorageAccess from "../src/ui/StorageAccess.vue";
import { clear, componentState } from "../src/ui/show.js";

vi.mock("../src/bootstrap/protocol.js", () => ({ setVisible: vi.fn() }));

const request = vi.fn();
const permission = vi.fn();

beforeEach(() => {
  request.mockReset().mockResolvedValue(undefined);
  permission.mockReset().mockResolvedValue({ state: "prompt" });
  vi.stubGlobal("window", { localStorage: {} });
  vi.stubGlobal("document", {
    hasStorageAccess: async () => false,
    requestStorageAccess: request,
  });
  vi.stubGlobal("navigator", { permissions: { query: permission } });
  vi.mocked(setVisible).mockClear();
  clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("storage access", () => {
  it("starts anonymously without requesting permission or showing UI", async () => {
    expect(await restoreStorageAccess()).toBe(false);
    expect(request).not.toHaveBeenCalled();
    expect(componentState.component).toBeNull();
    expect(setVisible).not.toHaveBeenCalled();
  });

  it("silently restores an existing grant and installs shared handles", async () => {
    permission.mockResolvedValue({ state: "granted" });
    const storage = {} as Storage;
    const database = {} as IDBFactory;
    request.mockResolvedValue({ localStorage: storage, indexedDB: database });
    expect(await restoreStorageAccess()).toBe(true);
    expect(window.localStorage).toBe(storage);
    expect(window.indexedDB).toBe(database);
    expect(componentState.component).toBeNull();
  });

  it("restores an active grant without requiring the Permissions API", async () => {
    document.hasStorageAccess = async () => true;
    permission.mockRejectedValue(new TypeError("Unsupported permission"));
    expect(await restoreStorageAccess()).toBe(true);
    expect(permission).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledOnce();
  });

  it("supports cookie-only browsers without retrying permission denials", async () => {
    document.hasStorageAccess = async () => true;
    request.mockRejectedValueOnce(new TypeError("No storage types"));
    expect(await restoreStorageAccess()).toBe(true);
    expect(request.mock.calls[1]).toEqual([]);

    request.mockReset().mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    expect(await restoreStorageAccess()).toBe(false);
    expect(request).toHaveBeenCalledOnce();
    expect(componentState.component).toBeNull();
  });

  it("requests permission only on Continue, and lets a denial return to browsing", async () => {
    request.mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    const result = activateStorageAccess();
    await vi.waitFor(() => expect(componentState.component).toBe(StorageAccess));
    expect(request).not.toHaveBeenCalled();
    await (componentState.props.onContinue as () => Promise<void>)();
    expect(request).toHaveBeenCalledOnce();
    expect(componentState.props.error).toBe(true);
    (componentState.props.onCancel as () => void)();
    expect(await result).toBe(false);
    expect(componentState.component).toBeNull();
    expect(setVisible).toHaveBeenLastCalledWith(false);
  });

  it("continues login after approval and also allows skipping the request", async () => {
    request.mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError"));
    const result = activateStorageAccess();
    await vi.waitFor(() => expect(componentState.component).toBe(StorageAccess));
    await (componentState.props.onContinue as () => Promise<void>)();
    expect(componentState.props.error).toBe(true);
    // A denial does not poison this attempt: Continue can retry the same login.
    await (componentState.props.onContinue as () => Promise<void>)();
    expect(await result).toBe(true);
    expect(componentState.component).toBeNull();

    request.mockClear();
    const skipped = activateStorageAccess();
    await vi.waitFor(() => expect(componentState.component).toBe(StorageAccess));
    (componentState.props.onCancel as () => void)();
    expect(await skipped).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("can browse when storage is inaccessible and the browser has no access API", async () => {
    vi.stubGlobal("document", {});
    vi.stubGlobal("window", {
      get localStorage() { throw new DOMException("Blocked", "SecurityError"); },
    });
    expect(await restoreStorageAccess()).toBe(false);
    expect(componentState.component).toBeNull();
  });
});
