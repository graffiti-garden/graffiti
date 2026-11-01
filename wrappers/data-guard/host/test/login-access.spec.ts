import { GraffitiErrorForbidden, type Graffiti } from "@graffiti-garden/api";
import { describe, expect, it, vi } from "vitest";
import { MemoryRules } from "./memory-rules.js";
import { GuardedGraffiti } from "../src/core/graffiti.js";
import { Guard } from "../src/core/guard.js";
import { LoginAccess } from "../src/core/login-access.js";
import { sourceFromContext } from "../src/core/source.js";
import { stampMedia } from "../src/core/media-provenance.js";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } as Storage;
}

describe("login access", () => {
  it("does not start authenticated discovery if login was revoked while policies loaded", async () => {
    const origin = "https://example.com";
    const source = sourceFromContext(origin, {});
    const access = new LoginAccess(memoryStorage());
    access.grant("alice", source);
    const db = new MemoryRules();
    const loading = Promise.withResolvers<void>();
    const load = vi.spyOn(db, "load").mockReturnValue(loading.promise);
    const discover = vi.fn(async function* () { return { cursor: "cursor" }; });
    const graffiti = { sessionEvents: new EventTarget(), discover } as unknown as Graffiti;
    const guarded = new GuardedGraffiti(
      graffiti, new Guard(graffiti, db, origin, async () => false, access), access, origin,
    );
    const next = guarded.discover(["chat"], {}, { actor: "alice" }).next();
    try {
      await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
      access.clear("alice");
      const rejection = expect(next).rejects.toBeInstanceOf(GraffitiErrorForbidden);
      loading.resolve();
      await rejection;
      expect(discover).not.toHaveBeenCalled();
    } finally {
      loading.resolve();
      await db.destroy();
    }
  });

  it("withholds a fetched private file if login is revoked while its prompt is open", async () => {
    const origin = "https://example.com";
    const source = sourceFromContext(origin, {});
    const access = new LoginAccess(memoryStorage());
    access.grant("alice", source);
    const db = new MemoryRules();
    const media = {
      data: stampMedia(new Blob(["private"]), sourceFromContext("https://other.example", {})),
      actor: "alice", allowed: [],
    };
    const graffiti = {
      sessionEvents: new EventTarget(), getMedia: vi.fn(async () => media),
    } as unknown as Graffiti;
    const answer = Promise.withResolvers<{ allow: boolean; remember: boolean }>();
    const ask = vi.fn(() => answer.promise);
    const guarded = new GuardedGraffiti(
      graffiti, new Guard(graffiti, db, origin, ask, access), access, origin,
    );
    const read = guarded.getMedia("graffiti:file", {}, { actor: "alice" });
    try {
      await vi.waitFor(() => expect(ask).toHaveBeenCalledOnce());
      access.clear("alice");
      const rejection = expect(read).rejects.toBeInstanceOf(GraffitiErrorForbidden);
      answer.resolve({ allow: true, remember: false });
      await rejection;
    } finally {
      answer.resolve({ allow: false, remember: false });
      await db.destroy();
    }
  });

  it("checks login again before a queued operation starts", async () => {
    const origin = "https://example.com";
    const source = sourceFromContext(origin, {});
    const access = new LoginAccess(memoryStorage());
    access.grant("alice", source);
    const db = new MemoryRules();
    const graffiti = { sessionEvents: new EventTarget(), post: vi.fn() } as unknown as Graffiti;
    const answer = Promise.withResolvers<false>();
    const ask = vi.fn(() => answer.promise);
    const guarded = new GuardedGraffiti(
      graffiti, new Guard(graffiti, db, origin, ask, access), access, origin,
    );
    const first = guarded.post({ value: { "confirm with guard": true }, channels: [] }, { actor: "alice" });
    const firstRejection = expect(first).rejects.toBeInstanceOf(GraffitiErrorForbidden);
    try {
      await vi.waitFor(() => expect(ask).toHaveBeenCalledOnce());
      const second = guarded.post({ value: {}, channels: [] }, { actor: "alice" });
      // Let the ordinary post pass its initial login check and join the queue.
      await new Promise((resolve) => setTimeout(resolve, 0));
      access.clear("alice");
      const secondRejection = expect(second).rejects.toBeInstanceOf(GraffitiErrorForbidden);
      answer.resolve(false);
      await firstRejection;
      await secondRejection;
      expect(graffiti.post).not.toHaveBeenCalled();
    } finally {
      answer.resolve(false);
      await db.destroy();
    }
  });

  it("grants a child and its ancestors for one actor until sign-out", () => {
    const storage = memoryStorage();
    const access = new LoginAccess(storage);
    const origin = "https://example.com";
    const parent = sourceFromContext(origin, { source: [{ id: "chat", name: "Chat" }] });
    const child = sourceFromContext(origin, {
      source: [{ id: "chat", name: "Chat" }, { id: "room", name: "Room" }],
    });
    const sibling = sourceFromContext(origin, {
      source: [{ id: "chat", name: "Chat" }, { id: "other", name: "Other" }],
    });

    access.grant("alice", child);
    expect(access.allows("alice", child)).toBe(true);
    expect(access.allows("alice", parent)).toBe(true);
    expect(access.allows("alice", sourceFromContext(origin, {}))).toBe(true);
    expect(access.allows("alice", sibling)).toBe(false);
    expect(access.allows("bob", child)).toBe(false);
    expect(new LoginAccess(storage).allows("alice", child)).toBe(true);
    access.clear("alice");
    expect(new LoginAccess(storage).allows("alice", child)).toBe(false);
  });

  it("clears site access on an observed logout event", () => {
    const storage = memoryStorage();
    const access = new LoginAccess(storage);
    const events = new EventTarget();
    const graffiti = { sessionEvents: events } as Graffiti;
    const guarded = new GuardedGraffiti(
      graffiti, {} as Guard, access, "https://example.com",
    );
    const site = sourceFromContext("https://example.com", {});
    access.grant("alice", site);
    events.dispatchEvent(new CustomEvent("login", {
      detail: { session: { actor: "alice" } },
    }));
    expect(new LoginAccess(storage).allows("alice", site)).toBe(true);

    const logouts: string[] = [];
    guarded.sessionEvents.addEventListener("logout", (event) => {
      logouts.push((event as CustomEvent).detail.actor);
    });
    events.dispatchEvent(new CustomEvent("logout", {
      detail: { actor: "alice" },
    }));
    expect(logouts).toEqual(["alice"]);
    expect(new LoginAccess(storage).allows("alice", site)).toBe(false);
  });

  it("preserves logout state after revoking the site's access", async () => {
    const origin = "https://example.com";
    const access = new LoginAccess(memoryStorage());
    access.grant("alice", sourceFromContext(origin, {}));
    const events = new EventTarget();
    const logout = vi.fn<Graffiti["logout"]>(async (session, options) => {
      expect(access.allows(session.actor, sourceFromContext(origin, {}))).toBe(false);
      events.dispatchEvent(new CustomEvent("logout", {
        detail: { actor: session.actor, state: options?.state },
      }));
    });
    const implementation = { sessionEvents: events, logout } as unknown as Graffiti;
    const db = new MemoryRules();
    const guard = new Guard(implementation, db, origin,
      async () => ({ logout: "device" }), access);
    const guarded = new GuardedGraffiti(implementation, guard, access, origin);
    events.dispatchEvent(new CustomEvent("login", { detail: { session: { actor: "alice" } } }));
    const received: unknown[] = [];
    guarded.sessionEvents.addEventListener("logout", event => received.push((event as CustomEvent).detail));
    try {
      await guarded.logout({ actor: "alice" }, { state: "logout-42" });
      expect(logout).toHaveBeenCalledExactlyOnceWith({ actor: "alice" }, { state: "logout-42" });
      expect(received).toEqual([{ actor: "alice", state: "logout-42" }]);
    } finally { await db.destroy(); }
  });

  it("rejects an authenticated call without site access, even with a guessed actor", async () => {
    const origin = "https://example.com";
    const access = new LoginAccess(memoryStorage());
    const db = new MemoryRules();
    const graffiti = { sessionEvents: new EventTarget() } as Graffiti;
    const guard = new Guard(graffiti, db, origin, async () => false, access);
    const childSource = [{ id: "chat", name: "Chat" }, { id: "room", name: "Room" }];
    const session = { actor: "alice", source: childSource };
    try {
      await expect(guard.authorize("post", [
        { value: { action: "Message" }, channels: [] }, session,
      ])).rejects.toBeInstanceOf(GraffitiErrorForbidden);
      access.grant("alice", sourceFromContext(origin, { source: childSource }));
      await expect(guard.authorize("post", [
        { value: { action: "Message" }, channels: [] }, session,
      ])).resolves.toBeDefined();
      await expect(guard.authorize("discover", [[], {}, {
        actor: "alice", source: [{ id: "chat", name: "Chat" }],
      }])).resolves.toBeUndefined();
      access.clear("alice");
      await expect(guard.authorize("discover", [[], {}, session]))
        .rejects.toBeInstanceOf(GraffitiErrorForbidden);
    } finally {
      await db.destroy();
    }
  });
});
