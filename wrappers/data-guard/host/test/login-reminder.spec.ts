import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createLoginReminder } from "../src/bootstrap/login-reminder.js";

const origin = "https://app.example";
const storage = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("window", { localStorage });
});
afterEach(() => vi.unstubAllGlobals());

function login(events: EventTarget, actor: string, guardSites = [[]]) {
  events.dispatchEvent(new CustomEvent("login", { detail: { session: { actor, guardSites } } }));
}

it("remembers successful site login across reloads, without storing identity", () => {
  const reminder = createLoginReminder(origin);
  expect(reminder.remembered).toBe(false);
  const events = new EventTarget();
  reminder.track(events);
  events.dispatchEvent(new CustomEvent("login", { detail: { error: new Error("Canceled") } }));
  expect(createLoginReminder(origin).remembered).toBe(false);
  login(events, "alice");
  expect(createLoginReminder(origin).remembered).toBe(true);
  expect(createLoginReminder("https://other.example").remembered).toBe(false);
  expect([...storage.values()]).toEqual(["1"]);
});

it("keeps the reminder until the last account logs out of the site", () => {
  const events = new EventTarget();
  createLoginReminder(origin).track(events);
  login(events, "alice");
  login(events, "bob");
  login(events, "alice", []);
  expect(createLoginReminder(origin).remembered).toBe(true);
  events.dispatchEvent(new CustomEvent("logout", { detail: { actor: "bob", error: new Error("Failed") } }));
  expect(createLoginReminder(origin).remembered).toBe(true);
  events.dispatchEvent(new CustomEvent("logout", { detail: { actor: "bob" } }));
  expect(createLoginReminder(origin).remembered).toBe(false);
});

it("keeps a skipped or failed restoration, but clears a verified empty session", () => {
  const original = new EventTarget();
  createLoginReminder(origin).track(original);
  login(original, "alice");
  // The bootstrap does not track anonymous sessions after skipping Continue.
  expect(createLoginReminder(origin).remembered).toBe(true);
  const restored = new EventTarget();
  createLoginReminder(origin).track(restored);
  restored.dispatchEvent(new CustomEvent("initialized", { detail: { error: new Error("Offline") } }));
  expect(createLoginReminder(origin).remembered).toBe(true);
  restored.dispatchEvent(new CustomEvent("initialized"));
  expect(createLoginReminder(origin).remembered).toBe(false);
});

it("uses the original storage even when cookie access installs a shared handle", () => {
  const reminder = createLoginReminder(origin);
  const sharedWrite = vi.fn();
  vi.stubGlobal("window", { localStorage: { setItem: sharedWrite } });
  const events = new EventTarget();
  reminder.track(events);
  login(events, "alice");
  expect(sharedWrite).not.toHaveBeenCalled();
  vi.stubGlobal("window", { localStorage });
  expect(createLoginReminder(origin).remembered).toBe(true);
});

it("does not break login when browser storage is blocked", () => {
  vi.stubGlobal("window", {
    localStorage: {
      getItem() { throw new DOMException("Blocked", "SecurityError"); },
      setItem() { throw new DOMException("Full", "QuotaExceededError"); },
      removeItem() { throw new DOMException("Blocked", "SecurityError"); },
    },
  });
  const reminder = createLoginReminder(origin);
  expect(reminder.remembered).toBe(false);
  const events = new EventTarget();
  reminder.track(events);
  login(events, "alice");
  events.dispatchEvent(new CustomEvent("logout", { detail: { actor: "alice" } }));
});
