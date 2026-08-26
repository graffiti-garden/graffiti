import type { Graffiti } from "@graffiti-garden/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuardedGraffiti } from "../src/core/graffiti.js";
import type { Guard } from "../src/core/guard.js";

afterEach(() => vi.restoreAllMocks());

describe("GuardedGraffiti audit finalization", () => {
  it("returns a successful result when only audit finalization fails", async () => {
    const result = { url: "graffiti:posted", actor: "actor:one" };
    const implementation = {
      sessionEvents: new EventTarget(),
      post: vi.fn().mockResolvedValue(result),
    } as unknown as Graffiti;
    const guard = {
      authorize: vi.fn().mockResolvedValue({ request: {} }),
      succeed: vi.fn().mockRejectedValue(new Error("IndexedDB unavailable")),
    } as unknown as Guard;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const graffiti = new GuardedGraffiti(implementation, guard);

    await expect(
      graffiti.post(
        { value: {}, channels: [] },
        { actor: "actor:one" },
      ),
    ).resolves.toBe(result);
    expect(error).toHaveBeenCalledOnce();
  });

  it("preserves the Graffiti error when recording that failure also fails", async () => {
    const operationError = new Error("Graffiti failed");
    const implementation = {
      sessionEvents: new EventTarget(),
      post: vi.fn().mockRejectedValue(operationError),
    } as unknown as Graffiti;
    const guard = {
      authorize: vi.fn().mockResolvedValue({ request: {} }),
      fail: vi.fn().mockRejectedValue(new Error("IndexedDB unavailable")),
    } as unknown as Guard;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const graffiti = new GuardedGraffiti(implementation, guard);

    await expect(
      graffiti.post(
        { value: {}, channels: [] },
        { actor: "actor:one" },
      ),
    ).rejects.toBe(operationError);
  });
});
