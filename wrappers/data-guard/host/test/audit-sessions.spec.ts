import type { Graffiti } from "@graffiti-garden/api";
import { expect, it } from "vitest";
import { trackAuditSessions } from "../src/ui/audit.js";

function fixture() {
  const sessionEvents = new EventTarget();
  const sessions = trackAuditSessions({ sessionEvents } as Graffiti);
  const emit = (type: string, detail: unknown) =>
    sessionEvents.dispatchEvent(new CustomEvent(type, { detail }));
  return { sessions, emit };
}

it("retains every restored account and its original session before the panel opens", () => {
  const { sessions, emit } = fixture();
  const alice = { actor: "alice", credential: "alice-session" };
  const bob = { actor: "bob", credential: "bob-session" };
  emit("login", { session: alice });
  emit("login", { session: bob });
  emit("initialized", undefined);
  expect([...sessions.keys()]).toEqual(["alice", "bob"]);
  expect(sessions.get("alice")).toBe(alice);
  expect(sessions.get("bob")).toBe(bob);

  const renewed = { ...alice, credential: "renewed-session" };
  emit("login", { session: renewed });
  expect(sessions.get("alice")).toBe(renewed);
  expect(sessions.size).toBe(2);
});

it("removes only the logged-out account and ignores failed login/logout events", () => {
  const { sessions, emit } = fixture();
  emit("login", { session: { actor: "alice" } });
  emit("login", { session: { actor: "bob" } });
  emit("login", { session: { actor: "eve" }, error: new Error("denied") });
  emit("logout", { actor: "alice", error: new Error("cancelled") });
  expect([...sessions.keys()]).toEqual(["alice", "bob"]);
  emit("logout", { actor: "alice" });
  expect([...sessions.keys()]).toEqual(["bob"]);
});
