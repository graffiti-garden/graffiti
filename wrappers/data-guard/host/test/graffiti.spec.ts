import {
  GraffitiErrorForbidden,
  type Graffiti,
} from "@graffiti-garden/api";
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

  it("authorizes private objects yielded by discoveries and continuations", async () => {
    const entry = {
      object: {
        url: "graffiti:private",
        value: {},
        channels: [],
        allowed: [],
        actor: "actor:one",
      },
    };
    const discovery = async function* () {
      yield entry;
      return { cursor: "next" };
    };
    const implementation = {
      sessionEvents: new EventTarget(),
      discover: discovery,
      continueDiscover: discovery,
    } as unknown as Graffiti;
    const guard = {
      authorizeDiscovered: vi.fn().mockResolvedValue({ request: {} }),
      succeed: vi.fn().mockResolvedValue(undefined),
    } as unknown as Guard;
    const graffiti = new GuardedGraffiti(implementation, guard);
    const session = { actor: "actor:one" };

    await graffiti.discover([], {}, session).next();
    await graffiti.continueDiscover("next", session).next();

    expect(guard.authorizeDiscovered).toHaveBeenNthCalledWith(
      1,
      [[], {}, session],
      entry.object,
    );
    expect(guard.authorizeDiscovered).toHaveBeenNthCalledWith(
      2,
      ["next", session],
      entry.object,
    );
    expect(guard.succeed).toHaveBeenCalledTimes(2);
  });

  it("passes public and upstream entries through and yields denials as errors", async () => {
    const upstreamError = {
      error: new Error("upstream failed"),
      origin: "https://storage.example",
    };
    const tombstone = {
      tombstone: true as const,
      object: { url: "graffiti:deleted" },
    };
    const publicUndefined = {
      object: {
        url: "graffiti:public-undefined",
        value: {},
        channels: [],
        actor: "actor:one",
      },
    };
    const publicNull = {
      object: {
        ...publicUndefined.object,
        url: "graffiti:public-null",
        allowed: null,
      },
    };
    const privateObject = {
      object: {
        ...publicUndefined.object,
        url: "graffiti:private",
        allowed: [],
      },
    };
    const afterDenial = {
      object: { ...publicUndefined.object, url: "graffiti:after-denial" },
    };
    const discovery = async function* () {
      yield upstreamError;
      yield tombstone;
      yield publicUndefined;
      yield publicNull;
      yield privateObject;
      yield afterDenial;
      return { cursor: "next" };
    };
    const implementation = {
      sessionEvents: new EventTarget(),
      discover: discovery,
    } as unknown as Graffiti;
    const guard = {
      authorizeDiscovered: vi
        .fn()
        .mockRejectedValue(new GraffitiErrorForbidden("denied")),
      succeed: vi.fn(),
    } as unknown as Guard;
    const graffiti = new GuardedGraffiti(implementation, guard);
    const iterator = graffiti.discover([], {}, { actor: "actor:one" });

    expect(await iterator.next()).toMatchObject({ value: upstreamError });
    expect(await iterator.next()).toMatchObject({ value: tombstone });
    expect(await iterator.next()).toMatchObject({ value: publicUndefined });
    expect(await iterator.next()).toMatchObject({ value: publicNull });
    const denied = await iterator.next();
    expect(denied.done).toBe(false);
    expect((denied.value as any).error).toBeInstanceOf(GraffitiErrorForbidden);
    expect((denied.value as any).origin).toBe("graffiti-guard:");
    expect(await iterator.next()).toMatchObject({ value: afterDenial });
    expect(await iterator.next()).toEqual({
      done: true,
      value: { cursor: "next" },
    });
    expect(guard.authorizeDiscovered).toHaveBeenCalledOnce();
    expect(guard.succeed).not.toHaveBeenCalled();
  });

  it("terminates a discovery when private-result storage fails", async () => {
    let closed = false;
    const discovery = async function* () {
      try {
        yield {
          object: {
            url: "graffiti:private",
            value: {},
            channels: [],
            allowed: [],
            actor: "actor:one",
          },
        };
      } finally {
        closed = true;
      }
      return { cursor: "next" };
    };
    const implementation = {
      sessionEvents: new EventTarget(),
      discover: discovery,
    } as unknown as Graffiti;
    const failure = new Error("IndexedDB unavailable");
    const guard = {
      authorizeDiscovered: vi.fn().mockRejectedValue(failure),
    } as unknown as Guard;
    const graffiti = new GuardedGraffiti(implementation, guard);

    await expect(
      graffiti.discover([], {}, { actor: "actor:one" }).next(),
    ).rejects.toBe(failure);
    expect(closed).toBe(true);
  });
});
