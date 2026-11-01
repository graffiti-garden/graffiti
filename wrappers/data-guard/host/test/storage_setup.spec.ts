import { afterEach, describe, expect, it, vi } from "vitest";
import { handleStorageSetup, isStorageSetup } from "../src/bootstrap/storage_setup.js";
import { show } from "../src/ui/show.js";

vi.mock("../src/ui/show.js", () => ({ show: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("storage setup links", () => {
  it("recognizes fragment parameters and legacy query parameters", () => {
    expect(
      isStorageSetup(new URL("https://guard.example/#guardStorageSetup=1")),
    ).toBe(true);
    expect(
      isStorageSetup(new URL("https://guard.example/?guardStorageSetup=1")),
    ).toBe(true);
  });

  it.each(["#", "?"])("preserves the return destination in %s setup links", (separator) => {
    vi.stubGlobal("document", { cookie: "" });
    const redirectUrl = "https://app.example/chat#room";
    const params = new URLSearchParams({ guardStorageSetup: "1", redirectUrl });
    handleStorageSetup(new URL(`https://guard.example/${separator}${params}`));
    expect(show).toHaveBeenCalledWith(expect.anything(), { setup: true, redirectUrl });
  });
});
