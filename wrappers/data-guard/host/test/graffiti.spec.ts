import {
  compileGraffitiObjectSchema,
  GraffitiErrorForbidden,
  type Graffiti,
} from "@graffiti-garden/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../src/core/db.js";
import { MemoryRules } from "./memory-rules.js";
import { GuardedGraffiti } from "../src/core/graffiti.js";
import { Guard, type GuardAnswer } from "../src/core/guard.js";
import { LoginAccess } from "../src/core/login-access.js";
import { sourceFromContext } from "../src/core/source.js";

afterEach(() => vi.restoreAllMocks());

function loginAccess() {
  const values = new Map<string, string>();
  return new LoginAccess({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  });
}

const source = sourceFromContext("https://example.com", {});
const foreignSite = '["https://other.example"]';
const foreignValue = { "via site": { name: "Other", id: foreignSite } };

function wrap(implementation: Graffiti, allow = true) {
  const db = new MemoryRules();
  const ask = vi.fn(async (_request: Request) => ({ allow, remember: false }));
  const guard = new Guard(implementation, db, source.origin, ask);
  return { graffiti: new GuardedGraffiti(implementation, guard), db, ask };
}

describe("GuardedGraffiti streams and posts", () => {
  it("serves public reads without storage while rejecting authenticated calls", async () => {
    const origin = "https://example.com";
    const object = { url: "graffiti:public", actor: "alice", value: {}, channels: [] };
    const implementation = {
      sessionEvents: new EventTarget(),
      get: vi.fn(async () => object),
      discover: vi.fn(async function* () { yield { object }; return { cursor: "next" }; }),
      post: vi.fn(),
    } as unknown as Graffiti;
    const access = new LoginAccess();
    const db = new MemoryRules();
    const prompt = vi.fn(async () => false as const);
    const guarded = new GuardedGraffiti(
      implementation, new Guard(implementation, db, origin, prompt, access), access, origin,
    );
    try {
      expect(await guarded.get(object.url, {})).toEqual(object);
      const stream = guarded.discover(["public"], {});
      expect(await stream.next()).toEqual({ done: false, value: { object } });
      expect(await stream.next()).toEqual({ done: true, value: { cursor: "next" } });

      const session = { actor: "alice" };
      vi.mocked(implementation.get).mockClear();
      await expect(guarded.get("graffiti:private", {}, session)).rejects.toBeInstanceOf(GraffitiErrorForbidden);
      await expect(guarded.post({ value: {}, channels: [] }, session)).rejects.toBeInstanceOf(GraffitiErrorForbidden);
      expect(implementation.get).not.toHaveBeenCalled();
      expect(implementation.post).not.toHaveBeenCalled();
      expect(prompt).not.toHaveBeenCalled();
    } finally {
      await db.destroy();
    }
  });

  it("checks session visibility for each verified frame and clears access on logout", () => {
    const origin = "https://example.com";
    const access = loginAccess();
    access.grant("alice", sourceFromContext(origin, {
      source: [{ id: "chat", name: "Chat" }],
    }));
    const events = new EventTarget();
    const implementation = { sessionEvents: events } as Graffiti;
    const guarded = new GuardedGraffiti(
      implementation,
      {} as Guard,
      access,
      origin,
    );
    const received: unknown[] = [];
    const logouts: unknown[] = [];
    guarded.sessionEvents.addEventListener("login", event => received.push((event as CustomEvent).detail));
    guarded.sessionEvents.addEventListener("logout", event => logouts.push((event as CustomEvent).detail));
    events.dispatchEvent(new CustomEvent("login", { detail: { session: { actor: "bob" } } }));
    events.dispatchEvent(new CustomEvent("login", { detail: { session: { actor: "alice", credential: "guard-only" } } }));
    expect(received).toEqual([{ session: { actor: "alice", guardSites: [["chat"]] } }]);
    events.dispatchEvent(new CustomEvent("logout", { detail: { actor: "bob" } }));
    expect(logouts).toEqual([]);
    events.dispatchEvent(new CustomEvent("logout", { detail: { actor: "alice" } }));
    expect(logouts).toEqual([{ actor: "alice" }]);
    expect(access.allows("alice", sourceFromContext(origin, {}))).toBe(false);
  });

  it("revokes site access before an OAuth logout can navigate away", async () => {
    const origin = "https://example.com";
    const access = loginAccess();
    access.grant("alice", sourceFromContext(origin, {}));
    const implementation = {
      sessionEvents: new EventTarget(),
      logout: vi.fn(async () => {
        expect(access.allows("alice", sourceFromContext(origin, {}))).toBe(false);
      }),
    } as unknown as Graffiti;
    const guard = {
      authorize: vi.fn().mockResolvedValue(undefined),
    } as unknown as Guard;
    const guarded = new GuardedGraffiti(implementation, guard, access, origin);
    await guarded.logout({ actor: "alice" });
    expect(implementation.logout).toHaveBeenCalledOnce();
  });

  it("does not start discovery for a blocked site", async () => {
    const origin = "https://example.com";
    const source = { origin, key: JSON.stringify([origin, "blocked"]), path: [{ id: "blocked", name: "Blocked" }] };
    const session = { actor: "actor:one", source: source.path };
    const db = new MemoryRules();
    await db.blockSource(source, session.actor);
    const discover = vi.fn(async function* () { return { cursor: "next" }; });
    const continueDiscover = vi.fn(async function* () { return { cursor: "next" }; });
    const implementation = { sessionEvents: new EventTarget(), discover, continueDiscover } as unknown as Graffiti;
    const guarded = new GuardedGraffiti(
      implementation,
      new Guard(implementation, db, origin, async () => false),
      undefined,
      origin,
    );
    try {
      const discoverStream = guarded.discover([], {}, Object.assign({}, session, { source: source.path })) as
        ReturnType<Graffiti["discover"]>;
      const continuation = guarded.continueDiscover("cursor", Object.assign({}, session, { source: source.path })) as
        ReturnType<Graffiti["continueDiscover"]>;
      await expect(discoverStream.next()).rejects.toBeInstanceOf(GraffitiErrorForbidden);
      await expect(continuation.next()).rejects.toBeInstanceOf(GraffitiErrorForbidden);
      expect(discover).not.toHaveBeenCalled();
      expect(continueDiscover).not.toHaveBeenCalled();
    } finally {
      await db.destroy();
    }
  });

  it.each([false, true])("applies read approval to discovery and continuation (tombstone=%s)", async tombstone => {
    const entry = {
      ...(tombstone ? { tombstone: true as const } : {}),
      object: { url: "graffiti:private", value: foreignValue, channels: [], allowed: [], actor: "actor:one" },
    };
    const discovery = async function* () {
      yield entry;
      yield entry;
      return { cursor: "next" };
    };
    const implementation = {
      sessionEvents: new EventTarget(), discover: discovery, continueDiscover: discovery,
    } as unknown as Graffiti;
    const { graffiti, db, ask } = wrap(implementation);
    const session = { actor: "actor:one" };
    if (tombstone) await db.remember({
      source, actor: session.actor, method: "get", decision: "allow",
      match: { kind: "site", site: foreignSite },
    });

    for (const results of [graffiti.discover([], {}, session), graffiti.continueDiscover("next", session)]) {
      expect(await results.next()).toEqual({ done: false, value: entry });
      expect(await results.next()).toEqual({ done: false, value: entry });
      expect(await results.next()).toEqual({ done: true, value: { cursor: "next" } });
    }
    // One-item approval also covers the continuation. Tombstones never prompt.
    expect(ask).toHaveBeenCalledTimes(tombstone ? 0 : 1);
  });

  it.each([false, true])("passes public results while hiding denied private data (tombstone=%s)", async (privateTombstone) => {
    const upstreamError = {
      error: new Error("upstream failed"),
      origin: "https://storage.example",
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
      ...(privateTombstone ? { tombstone: true as const } : {}),
      object: {
        ...publicUndefined.object,
        url: "graffiti:private",
        value: foreignValue,
        allowed: [],
      },
    };
    const tombstone = {
      tombstone: true as const,
      object: { ...publicUndefined.object, url: "graffiti:deleted" },
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
    const { graffiti, ask } = wrap(implementation, false);
    const iterator = graffiti.discover([], {}, { actor: "actor:one" });

    expect(await iterator.next()).toMatchObject({ value: upstreamError });
    expect(await iterator.next()).toMatchObject({ value: tombstone });
    expect(await iterator.next()).toMatchObject({ value: publicUndefined });
    expect(await iterator.next()).toMatchObject({ value: publicNull });
    expect(await iterator.next()).toMatchObject({ value: afterDenial });
    const end = await iterator.next();
    expect(end.done).toBe(true);
    expect(end.value.cursor).toBe("next");
    expect(ask).toHaveBeenCalledTimes(privateTombstone ? 0 : 1);
  });

  it("withholds private deletion notices without prior read approval", async () => {
    const privateTombstone = {
      tombstone: true as const,
      object: {
        url: "graffiti:private-deleted",
        value: { ...foreignValue, secret: "private" },
        channels: ["private-channel"],
        allowed: ["actor:one"],
        actor: "actor:one",
      },
    };
    const discovery = async function* () {
      yield privateTombstone;
      // Approval can arrive from another request while discovery is running.
      await db.remember({ source, actor: "actor:one", method: "get", decision: "allow",
        match: { kind: "site", site: foreignSite } });
      yield privateTombstone;
      return { cursor: "next" };
    };
    const implementation = {
      sessionEvents: new EventTarget(),
      continueDiscover: discovery,
    } as unknown as Graffiti;
    const { graffiti, db, ask } = wrap(implementation);
    const session = { actor: "actor:one" };
    const iterator = graffiti.continueDiscover("previous", session);

    expect(await iterator.next()).toEqual({ done: false, value: privateTombstone });
    const end = await iterator.next();
    expect(end.done).toBe(true);
    expect(end.value.cursor).toBe("next");
    expect(ask).not.toHaveBeenCalled();
  });

  it("closes discovery when private-result authorization fails", async () => {
    let closed = false;
    const discovery = async function* () {
      try {
        yield {
          object: {
            url: "graffiti:private",
            value: foreignValue,
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
    const failure = new Error("Permission store unavailable");
    const { graffiti, db } = wrap(implementation);
    vi.spyOn(db, "permissions").mockRejectedValue(failure);

    await expect(
      graffiti.discover([], {}, { actor: "actor:one" }).next(),
    ).rejects.toBe(failure);
    expect(closed).toBe(true);
  });

  it("applies ordinary read approval to policies while hiding media receipts", async () => {
    const base = {
      actor: "actor:one",
      channels: ["channel"],
      allowed: [],
    };
    const policy = {
      object: {
        ...base,
        url: "graffiti:policy",
        value: {
          action: "Remember permission",
          "confirm with guard": true,
          "via site": { name: "Guard", id: '["https://guard.example"]' },
          published: 123,
          site: { origin: "https://example.com", path: [] },
          rule: { method: "logout", decision: "deny", match: { kind: "logout" } },
        },
      },
    };
    const receipt = {
      object: {
        ...base,
        url: "graffiti:receipt",
        value: { mediaUrl: "graffiti:file", _guard: { kind: "media-receipt" } },
      },
    };
    const ordinary = {
      object: { ...base, url: "graffiti:ordinary", value: { note: "visible" } },
    };
    const implementation = {
      sessionEvents: new EventTarget(),
      discover: async function* () {
        yield policy;
        yield receipt;
        yield ordinary;
        return { cursor: "next" };
      },
    } as unknown as Graffiti;
    const { graffiti: guarded, ask } = wrap(implementation);
    const stream = guarded.discover(["channel"], {}, { actor: "actor:one" });

    expect(await stream.next()).toMatchObject({ value: policy });
    expect(await stream.next()).toMatchObject({ value: ordinary });
    expect(await stream.next()).toMatchObject({ done: true });
    expect(ask).toHaveBeenCalledOnce();
    expect(ask.mock.calls[0][0].subject).toEqual({ kind: "object", object: policy.object });
  });

  it("forwards the exact confirmed post reviewed by the person", async () => {
    const db = new MemoryRules();
    let approve: (answer: GuardAnswer) => void = () => {};
    const answer = new Promise<GuardAnswer>((resolve) => { approve = resolve; });
    const prompt = vi.fn(async () => answer);
    const post = vi.fn(async (value: object) => ({ ...value, url: "graffiti:posted", actor: "actor:one" }));
    const implementation = {
      sessionEvents: new EventTarget(),
      post,
    } as unknown as Graffiti;
    const guarded = new GuardedGraffiti(
      implementation,
      new Guard(implementation, db, "https://example.com", prompt),
      undefined,
      "https://example.com",
    );
    const source = [{ id: "version-one", name: "Page" }];
    const session = { actor: "actor:one", source };
    const proposed = {
      value: { action: "Trust", target: "actor:two", "confirm with guard": true },
      channels: ["profile"],
      allowed: [] as string[],
    };

    try {
      const pending = guarded.post(proposed, Object.assign({}, session, { source: source })) as Promise<unknown>;
      await vi.waitFor(() => expect(prompt).toHaveBeenCalledOnce());
      proposed.value.target = "actor:three";
      proposed.channels.push("other");
      proposed.allowed.push("actor:three");
      source[0].id = "version-two";
      approve({ allow: true, remember: true });
      await pending;

      expect(post).toHaveBeenCalledWith(
        {
          value: {
            action: "Trust",
            target: "actor:two",
            "confirm with guard": true,
            "via site": {
              name: "Page",
              id: '["https://example.com","version-one"]',
            },
          },
          channels: ["profile"],
          allowed: [],
        },
        { actor: "actor:one" },
      );
    } finally {
      approve({ allow: false, remember: false });
      await db.destroy();
    }
  });

  it("uses the implementation schema filter before prompting for private discovery", async () => {
    const privateObject = {
      url: "graffiti:private-other-site",
      actor: "actor:one",
      channels: ["notes"],
      allowed: [],
      value: {
        content: "secret",
        "via site": {
          name: "Other page",
          id: '["https://example.com","other-page"]',
        },
      },
    };
    const schema = {
      properties: { value: { properties: { content: { const: "wrong guess" } } } },
    } as const;
    const querySchemas: unknown[] = [];
    const implementation = {
      sessionEvents: new EventTarget(),
      discover: async function* (_channels: string[], querySchema: any) {
        querySchemas.push(querySchema);
        const matches = await compileGraffitiObjectSchema(querySchema);
        if (matches(privateObject)) yield { object: privateObject };
        return { cursor: "raw" };
      },
    } as unknown as Graffiti;
    const db = new MemoryRules();
    const ask = vi.fn(async () => ({ allow: false, remember: false }));
    const guarded = new GuardedGraffiti(
      implementation,
      new Guard(implementation, db, "https://example.com", ask),
      undefined,
      "https://example.com",
    );
    try {
      const stream = guarded.discover(["notes"], schema, Object.assign({}, { actor: "actor:one" }, { source: [{ id: "current-page", name: "Current page" }] })) as ReturnType<Graffiti["discover"]>;
      expect(await stream.next()).toMatchObject({ done: true });
      expect(querySchemas).toEqual([schema]);
      expect(ask).not.toHaveBeenCalled();
    } finally {
      await db.destroy();
    }
  });
});
