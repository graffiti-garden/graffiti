import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LoginAccess } from "../src/core/login-access.js";
import { loginStorage } from "../src/core/login-storage.js";
import { sourceFromContext } from "../src/core/source.js";

const values = new Map<string, string>();
const cookies = new Map<string, string>();
const writes: string[] = [];
const local = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
};
const site = sourceFromContext("https://social.wiki", { source: [{ id: "chat", name: "Chat" }] });
const other = sourceFromContext("https://other.example", {});

beforeEach(() => {
  values.clear();
  cookies.clear();
  writes.length = 0;
  vi.stubGlobal("window", { location: new URL("https://guard.example/") });
  vi.stubGlobal("document", {
    get cookie() { return [...cookies].map(([key, value]) => `${key}=${value}`).join("; "); },
    set cookie(value: string) {
      writes.push(value);
      const [pair] = value.split(";");
      const index = pair.indexOf("=");
      if (value.length <= 4096) cookies.set(pair.slice(0, index), pair.slice(index + 1));
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

it("restores only the approved actor and site after losing localStorage", () => {
  new LoginAccess(loginStorage(local)).grant("alice", site);
  values.clear();
  const access = new LoginAccess(loginStorage(local));
  expect(access.allows("alice", site)).toBe(true);
  expect(access.allows("bob", site)).toBe(false);
  expect(access.allows("alice", other)).toBe(false);
  expect(writes[0]).toContain("SameSite=None; Secure; Partitioned");
  expect(writes[0]).not.toContain("Domain=");
});

it("keeps site logout and account logout after localStorage is lost", () => {
  const access = new LoginAccess(loginStorage(local));
  access.grant("alice", site);
  access.grant("alice", other);
  values.clear();
  access.revoke("alice", site);
  values.clear();
  expect(access.allows("alice", site)).toBe(false);
  expect(access.allows("alice", other)).toBe(true);
  access.clear("alice");
  values.clear();
  expect(new LoginAccess(loginStorage(local)).allows("alice", other)).toBe(false);
});

it("does not revive an older approval list when its replacement exceeds cookie limits", () => {
  const storage = loginStorage(local)!;
  const key = "graffiti-guard:login-access-v3:alice";
  const access = new LoginAccess(storage);
  access.grant("alice", site);
  const large = JSON.stringify([["https://other.example", "x".repeat(4000)]]);
  storage.setItem(key, large);
  expect(storage.getItem(key)).toBe(large);
  values.clear();
  expect(new LoginAccess(loginStorage(local)).allows("alice", site)).toBe(false);
});

it("uses existing local storage if cookies are blocked or the page is HTTP", () => {
  vi.stubGlobal("document", {
    get cookie() { throw new DOMException("Blocked", "SecurityError"); },
    set cookie(_value: string) { throw new DOMException("Blocked", "SecurityError"); },
  });
  new LoginAccess(loginStorage(local)).grant("alice", site);
  expect(new LoginAccess(loginStorage(local)).allows("alice", site)).toBe(true);
  vi.stubGlobal("window", { location: new URL("http://localhost:5194/") });
  const access = new LoginAccess(loginStorage(local));
  access.clear("alice");
  expect(access.allows("alice", site)).toBe(false);
  expect(loginStorage(undefined)).toBeUndefined();
});
