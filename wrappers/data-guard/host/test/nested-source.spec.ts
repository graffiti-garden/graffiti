import type { Graffiti } from "@graffiti-garden/api";
import { expect, it, vi } from "vitest";
import { withGuardSource, type GuardSession } from "../../client/src/source.js";

function fixture() {
  const sessionEvents = new EventTarget();
  const graffiti = {
    sessionEvents,
    login: vi.fn(async () => {}),
    post: vi.fn(async () => ({})),
    get: vi.fn(async () => ({})),
  } as unknown as Graffiti;
  const emit = (type: string, detail?: unknown) =>
    sessionEvents.dispatchEvent(new CustomEvent(type, { detail }));
  return { graffiti, emit };
}

it("prefixes login and authenticated calls at each parent, without changing the caller's session", async () => {
  const { graffiti } = fixture();
  const app = { id: "chats", name: "Chats" };
  const room = { id: "room", name: "Room", url: "https://example.com/room" };
  const outer = withGuardSource(graffiti, () => app);
  const inner = withGuardSource(outer.graffiti, () => room);
  const session: GuardSession = { actor: "alice", source: [] };
  try {
    await inner.graffiti.login({ state: "caller-state" });
    expect(graffiti.login).toHaveBeenCalledExactlyOnceWith({ state: "caller-state", source: [app, room] });
    const object = { value: { message: "Hello" }, channels: ["room"] };
    await inner.graffiti.post(object, session);
    expect(graffiti.post).toHaveBeenCalledExactlyOnceWith(object, { actor: "alice", source: [app, room] });
    expect(session).toEqual({ actor: "alice", source: [] });
    await inner.graffiti.get("public", {});
    expect(graffiti.get).toHaveBeenCalledExactlyOnceWith("public", {});
  } finally { inner.destroy(); outer.destroy(); }
});

it("shares identity upwards, never with siblings or children of an approved parent", () => {
  const { graffiti, emit } = fixture();
  const chat = withGuardSource(graffiti, () => ({ id: "chats", name: "Chats" }));
  const room = withGuardSource(chat.graffiti, () => ({ id: "room", name: "Room" }));
  const sibling = withGuardSource(chat.graffiti, () => ({ id: "game", name: "Game" }));
  const received = [chat, room, sibling].map(view => {
    const events: { type: string; detail: any }[] = [];
    for (const type of ["login", "logout", "initialized"]) view.graffiti.sessionEvents
      .addEventListener(type, event => events.push({ type, detail: (event as CustomEvent).detail }));
    return events;
  });
  try {
    emit("login", { session: { actor: "alice", guardSites: [["chats", "room"], ["elsewhere"]] } });
    emit("login", { session: { actor: "bob", guardSites: [["chats"]] } });
    expect(received[0].map(event => event.detail.session)).toEqual([
      { actor: "alice", guardSites: [["room"]] }, { actor: "bob", guardSites: [[]] },
    ]);
    expect(received[1].map(event => event.detail.session)).toEqual([{ actor: "alice", guardSites: [[]] }]);
    expect(received[2]).toEqual([]);
    emit("logout", { actor: "bob" });
    emit("logout", { actor: "alice" });
    emit("initialized");
    expect(received[1].map(event => event.type)).toEqual(["login", "logout", "initialized"]);
    expect(received[2].map(event => event.type)).toEqual(["initialized"]);
  } finally { for (const view of [chat, room, sibling]) view.destroy(); }
});

it("supports inherited scopes and Graffiti implementations without a guard", async () => {
  const { graffiti, emit } = fixture();
  const view = withGuardSource(graffiti, () => undefined);
  const login = vi.fn();
  view.graffiti.sessionEvents.addEventListener("login", login);
  emit("login", { session: { actor: "alice" }, state: "state" });
  expect(login.mock.calls[0][0].detail).toEqual({ session: { actor: "alice" }, state: "state" });
  await view.graffiti.login();
  expect(graffiti.login).toHaveBeenCalledWith({ source: [] });
  view.destroy();
  emit("login", { session: { actor: "bob" } });
  expect(login).toHaveBeenCalledOnce();
});

it("does not reveal an unrelated identity through an error event", () => {
  const { graffiti, emit } = fixture();
  const view = withGuardSource(graffiti, () => ({ id: "game", name: "Game" }));
  const seen: unknown[] = [];
  for (const type of ["login", "logout"]) view.graffiti.sessionEvents.addEventListener(type,
    event => seen.push((event as CustomEvent).detail));
  const error = new Error("Unavailable");
  emit("login", { error, session: { actor: "private-account", guardSites: [["chat"]] }, state: "request" });
  emit("logout", { error, actor: "private-account" });
  expect(seen).toEqual([{ error, state: "request" }, { error }]);
  view.destroy();
});

it("returns a caller's result after reload without restoring an unapproved identity", () => {
  const { graffiti, emit } = fixture();
  const view = withGuardSource(graffiti, () => ({ id: "chat", name: "Chat" }));
  const seen: { type: string; detail: any }[] = [];
  for (const type of ["login", "logout"]) view.graffiti.sessionEvents.addEventListener(type,
    event => seen.push({ type, detail: (event as CustomEvent).detail }));
  try {
    // The frame did not receive this account during restoration.
    emit("logout", { actor: "alice" });
    expect(seen).toEqual([]);
    emit("logout", { actor: "alice", state: "sign-out-request" });
    emit("login", { session: { actor: "alice", guardSites: [] }, state: "stale-login-request" });
    expect(seen).toEqual([
      { type: "logout", detail: { actor: "alice", state: "sign-out-request" } },
      { type: "login", detail: { error: expect.any(Error), state: "stale-login-request" } },
    ]);
  } finally { view.destroy(); }
});
