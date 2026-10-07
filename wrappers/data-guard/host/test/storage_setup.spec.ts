import { describe, expect, it } from "vitest";
import { isStorageSetup } from "../src/bootstrap/storage_setup.js";

describe("storage setup links", () => {
  it("recognizes fragment parameters and legacy query parameters", () => {
    expect(
      isStorageSetup(new URL("https://guard.example/#guardStorageSetup=1")),
    ).toBe(true);
    expect(
      isStorageSetup(new URL("https://guard.example/?guardStorageSetup=1")),
    ).toBe(true);
  });
});
