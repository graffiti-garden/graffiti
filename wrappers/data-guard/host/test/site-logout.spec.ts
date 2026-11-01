import { GraffitiErrorForbidden, type Graffiti } from "@graffiti-garden/api";
import { createGraffitiRelay } from "@graffiti-garden/wrapper-iframe-rpc/host";
import { describe, expect, it, vi } from "vitest";
import { withGuardSource } from "../../client/src/source.js";
import { Guard, type GuardAnswer } from "../src/core/guard.js";
import { GuardedGraffiti } from "../src/core/graffiti.js";
import { LoginAccess } from "../src/core/login-access.js";
import { sourceFromContext } from "../src/core/source.js";
import { MemoryRules } from "./memory-rules.js";

const origin = "https://social.example";
const chat = { id: "chats", name: "Chats" };
const room = { id: "room", name: "Room" };
const other = { id: "other", name: "Other" };

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function fixture(answer: GuardAnswer = { logout: "site" }) {
  const saved = storage();
  const access = new LoginAccess(saved);
  const db = new MemoryRules();
  const events = new EventTarget();
  const implementation = {
    sessionEvents: events,
    post: vi.fn(async object => object),
    logout: vi.fn<Graffiti["logout"]>(async (session, options) => {
      events.dispatchEvent(new CustomEvent("logout", {
        detail: { actor: session.actor, state: options?.state },
      }));
    }),
  } as unknown as Graffiti;
  const ask = vi.fn(async () => answer);
  const guarded = new GuardedGraffiti(implementation,
    new Guard(implementation, db, origin, ask, access), access, origin);
  const root = withGuardSource(guarded, () => undefined);
  const parent = withGuardSource(root.graffiti, () => chat);
  const child = withGuardSource(parent.graffiti, () => room);
  const sibling = withGuardSource(parent.graffiti, () => other);
  const views = { root, parent, child, sibling };
  const seen = Object.fromEntries(Object.entries(views).map(([name, view]) => {
    const logouts: { actor: string; state?: string }[] = [];
    view.graffiti.sessionEvents.addEventListener("logout", event => logouts.push((event as CustomEvent).detail));
    return [name, logouts];
  }));
  for (const actor of ["alice", "bob"]) {
    for (const leaf of [room, other]) access.grant(actor, sourceFromContext(origin, { source: [chat, leaf] }));
    events.dispatchEvent(new CustomEvent("login", { detail: { session: { actor } } }));
  }
  events.dispatchEvent(new CustomEvent("initialized"));
  return { ...views, seen, access, saved, ask, implementation, db,
    destroy() { for (const view of Object.values(views)) view.destroy(); },
  };
}

describe("site logout", () => {
  it.each(["site", "device"] as const)("allows %s logout from a blocked site without loading data permissions", async (logout) => {
    const f = fixture({ logout });
    const child = sourceFromContext(origin, { source: [chat, room] });
    await f.db.blockSource(child, "alice");
    const load = vi.spyOn(f.db, "load");
    try {
      await f.child.graffiti.logout({ actor: "alice" });
      expect(f.ask).toHaveBeenCalledOnce();
      expect(f.access.allows("alice", child)).toBe(false);
      expect(load).not.toHaveBeenCalled();
    } finally { f.destroy(); }
  });

  it.each([
    { target: "child", remaining: ["root", "parent", "sibling"] },
    { target: "parent", remaining: ["root"] },
    { target: "root", remaining: [] },
  ] as const)("logs out $target and its descendants, preserving parents and siblings", async ({ target, remaining }) => {
    const f = fixture();
    const paths = { root: [], parent: [chat], child: [chat, room], sibling: [chat, other] };
    try {
      await f[target].graffiti.logout({ actor: "alice" }, { state: "logout-request" });
      expect(f.implementation.logout).not.toHaveBeenCalled();
      expect(f.ask).toHaveBeenCalledWith(expect.objectContaining({
        method: "logout", source: sourceFromContext(origin, { source: paths[target] }),
      }), false, undefined, expect.anything());
      for (const [name, path] of Object.entries(paths)) {
        const source = sourceFromContext(origin, { source: path });
        const stays = (remaining as readonly string[]).includes(name);
        expect(new LoginAccess(f.saved).allows("alice", source)).toBe(stays);
        expect(f.access.allows("bob", source)).toBe(true);
        expect(f.seen[name]).toEqual(stays ? [] : [{ actor: "alice", state: "logout-request" }]);
        const write = f[name as keyof typeof paths].graffiti.post({ value: {}, channels: [] }, { actor: "alice" });
        if (stays) await expect(write).resolves.toBeDefined();
        else await expect(write).rejects.toBeInstanceOf(GraffitiErrorForbidden);
      }
    } finally { f.destroy(); }
  });

  it("All sites ends this identity's implementation session and clears its other origins", async () => {
    const f = fixture({ logout: "device" });
    const elsewhere = sourceFromContext("https://elsewhere.example", {});
    f.access.grant("alice", elsewhere);
    try {
      await f.child.graffiti.logout({ actor: "alice" }, { state: "device-logout" });
      expect(f.implementation.logout).toHaveBeenCalledExactlyOnceWith({ actor: "alice" }, { state: "device-logout" });
      expect(f.access.allows("alice", elsewhere)).toBe(false);
      for (const logouts of Object.values(f.seen)) expect(logouts).toEqual([{ actor: "alice", state: "device-logout" }]);
      expect(f.access.allows("bob", sourceFromContext(origin, {}))).toBe(true);
    } finally { f.destroy(); }
  });

  it("Cancel leaves every site signed in", async () => {
    const f = fixture(false);
    try {
      await expect(f.child.graffiti.logout({ actor: "alice" })).rejects.toBeInstanceOf(GraffitiErrorForbidden);
      expect(f.implementation.logout).not.toHaveBeenCalled();
      expect(f.access.allows("alice", sourceFromContext(origin, { source: [chat, room] }))).toBe(true);
      expect(Object.values(f.seen).flat()).toEqual([]);
    } finally { f.destroy(); }
  });

  it("restores the remaining approvals when nested frames are recreated", async () => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    const f = fixture();
    const relay = createGraffitiRelay(f.root.graffiti, "frame");
    let late: ReturnType<typeof createGraffitiRelay> | undefined;
    const views: ReturnType<typeof withGuardSource>[] = [];
    try {
      // Capture restoration, then the logout update, in the ordinary RPC relay.
      f.implementation.sessionEvents.dispatchEvent(new CustomEvent("login", { detail: { session: { actor: "alice" } } }));
      f.root.graffiti.sessionEvents.dispatchEvent(new CustomEvent("initialized"));
      await f.child.graffiti.logout({ actor: "alice" });
      relay.destroy();

      late = createGraffitiRelay(f.root.graffiti, "frame");
      const parent = withGuardSource(late.graffiti, () => chat);
      const child = withGuardSource(parent.graffiti, () => room);
      const sibling = withGuardSource(parent.graffiti, () => other);
      views.push(parent, child, sibling);
      const seen = views.map(view => {
        const actors: string[] = [];
        view.graffiti.sessionEvents.addEventListener("login", event => actors.push((event as CustomEvent).detail.session.actor));
        return actors;
      });
      await new Promise<void>(resolve => child.graffiti.sessionEvents.addEventListener("initialized", () => resolve(), { once: true }));
      expect(seen).toEqual([["alice"], [], ["alice"]]);
    } finally {
      for (const view of views) view.destroy();
      late?.destroy(); relay.destroy(); f.destroy(); vi.unstubAllGlobals();
    }
  });

  it("preserves the parent after its last child logs out, including after reload", () => {
    const saved = storage();
    const access = new LoginAccess(saved);
    const root = sourceFromContext(origin, {});
    const parent = sourceFromContext(origin, { source: [chat] });
    const child = sourceFromContext(origin, { source: [chat, room] });
    access.grant("alice", child);
    expect(access.allows("alice", parent)).toBe(true);
    access.revoke("alice", child);
    const restored = new LoginAccess(saved);
    expect(restored.allows("alice", child)).toBe(false);
    expect(restored.allows("alice", parent)).toBe(true);
    expect(restored.allows("alice", root)).toBe(true);
  });
});
