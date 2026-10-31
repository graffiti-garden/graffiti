import { afterEach, expect, test, vi } from "vitest";
import { GraffitiLocalIdentity } from "./identity";

afterEach(() => vi.unstubAllGlobals());

test.each([
  ...["chosen", "a,b", "100%", "alice%20bob"].map(handle => ({ handle, removed: false })),
  { handle: "chosen", removed: true },
])("returns the state after reload for $handle (removed=$removed)", async ({ handle, removed }) => {
  const stored = new Map<string, string>([["graffiti-handles", "other"]]);
  const pending = new Map<string, string>();
  const storage = (items: Map<string, string>) => ({
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
    removeItem: (key: string) => { items.delete(key); },
  });
  const reload = vi.fn();
  vi.stubGlobal("window", {
    localStorage: storage(stored),
    sessionStorage: storage(pending),
    location: { reload },
  });

  const input = { value: "", focus() {} };
  const dialog = new EventTarget() as EventTarget & {
    innerHTML: string;
    returnValue: string;
    querySelector(): typeof input;
    showModal(): void;
    remove(): void;
  };
  dialog.querySelector = () => input;
  dialog.showModal = () => {
    dialog.returnValue = "login";
    dialog.dispatchEvent(new Event("close"));
  };
  dialog.remove = () => {};
  vi.stubGlobal("document", {
    createElement: () => dialog,
    body: { append() {} },
  });

  const beforeReload = new GraffitiLocalIdentity();
  await beforeReload.login({
    actor: await beforeReload.handleToActor(handle),
    state: "request-123",
  });
  expect(reload).toHaveBeenCalledOnce();
  expect(stored.get("graffiti-handles")).toBe(["other", handle].map(encodeURIComponent).join(","));
  if (removed) stored.set("graffiti-handles", "other"); // Another tab logged out.

  const events: { actor?: string; error?: Error; state?: string }[] = [];
  const afterReload = new GraffitiLocalIdentity();
  afterReload.sessionEvents.addEventListener("login", (event) => {
    const detail = (event as CustomEvent<{ session?: { actor: string }; error?: Error; state?: string }>).detail;
    events.push({ actor: detail.session?.actor, error: detail.error, state: detail.state });
  });
  await new Promise<void>((resolve) =>
    afterReload.sessionEvents.addEventListener("initialized", () => resolve(), { once: true }));
  expect(events).toEqual([
    { actor: await afterReload.handleToActor("other"), state: undefined },
    removed ? { error: expect.any(Error), state: "request-123" }
      : { actor: await afterReload.handleToActor(handle), state: "request-123" },
  ]);

  const later: { state?: string }[] = [];
  const ordinaryRestore = new GraffitiLocalIdentity();
  ordinaryRestore.sessionEvents.addEventListener("login", (event) => {
    later.push((event as CustomEvent<{ state?: string }>).detail);
  });
  await new Promise<void>((resolve) =>
    ordinaryRestore.sessionEvents.addEventListener("initialized", () => resolve(), { once: true }));
  expect(later.every((event) => event.state === undefined)).toBe(true);
});

test("returns the state for a local login without a browser", async () => {
  const identity = new GraffitiLocalIdentity();
  const events: CustomEvent[] = [];
  identity.sessionEvents.addEventListener("login", event => events.push(event as CustomEvent));
  const actor = await identity.handleToActor("node-user");
  await identity.login({ actor, state: "node-login" });
  expect(events.at(-1)?.detail).toEqual({ session: { actor }, state: "node-login" });
});

test("rejects an overlapping local login with that request's ID", async () => {
  const identity = new GraffitiLocalIdentity();
  const events: CustomEvent[] = [];
  identity.sessionEvents.addEventListener("login", event => events.push(event as CustomEvent));
  const actor = await identity.handleToActor("chosen");
  const first = identity.login({ actor, state: "first" });
  await identity.login({ actor, state: "second" });
  await first;
  expect(events.map(event => [event.detail.state, !!event.detail.error])).toEqual([
    ["second", true], ["first", false],
  ]);
});

test("correlates local logout success and failures without leaking an earlier ID", async () => {
  const identity = new GraffitiLocalIdentity();
  const actor = await identity.handleToActor("logout-user");
  await identity.login({ actor, state: "login-id" });
  const events: CustomEvent[] = [];
  identity.sessionEvents.addEventListener("logout", event => events.push(event as CustomEvent));
  await identity.logout({ actor }, { state: "logout-id" });
  await identity.logout({ actor }, { state: "missing-id" });
  await identity.logout({ actor });
  await identity.logout({ actor: "invalid" }, { state: "invalid-id" });
  expect(events.map(event => event.detail)).toEqual([
    { actor, state: "logout-id" },
    { actor, error: expect.any(Error), state: "missing-id" },
    { actor, error: expect.any(Error), state: undefined },
    { actor: "invalid", error: expect.any(Error), state: "invalid-id" },
  ]);
});

test.each([undefined, "chosen"])("allows another login from a result listener (handle=%s)", async handle => {
  const identity = new GraffitiLocalIdentity();
  const actor = await identity.handleToActor("chosen");
  const events: CustomEvent[] = [];
  let next: Promise<void> | undefined;
  identity.sessionEvents.addEventListener("login", event => {
    events.push(event as CustomEvent);
    if (events.length === 1) next = identity.login({ actor, state: "next" });
  });
  await identity.login({ actor: handle ? actor : undefined, state: "first" });
  await next;
  expect(events.map(event => [event.detail.state, !!event.detail.error])).toEqual([
    ["first", !handle], ["next", false],
  ]);
});
