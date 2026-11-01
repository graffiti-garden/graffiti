import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { GuardedGraffiti } from "../src/core/graffiti.js";

const fake = vi.hoisted(() => ({
  listen: vi.fn(),
  restore: vi.fn(),
  activate: vi.fn(),
  completed: vi.fn(),
  serve: vi.fn(() => ({ connect: vi.fn() })),
  events: new EventTarget(),
  storage: new Map<string, string>(),
  created: vi.fn(),
}));
vi.mock("../src/bootstrap/protocol.js", () => ({
  listenToParent: fake.listen,
  setVisible: vi.fn(),
  requestLoginRedirect: vi.fn(),
}));
vi.mock("../src/bootstrap/storage_access.js", () => ({
  restoreStorageAccess: fake.restore,
  activateStorageAccess: fake.activate,
  getLocalStorage: () => ({
    getItem: (key: string) => fake.storage.get(key) ?? null,
    setItem: (key: string, value: string) => fake.storage.set(key, value),
    removeItem: (key: string) => fake.storage.delete(key),
  }),
}));
vi.mock("../src/bootstrap/login_redirect.js", () => ({
  takeLoginResult: fake.completed,
}));
vi.mock("@graffiti-garden/wrapper-iframe-rpc/host", () => ({ serveGraffiti: fake.serve }));
vi.mock("@graffiti-garden/implementation-decentralized", () => ({
  GraffitiDecentralized: class {
    sessionEvents = fake.events;
    constructor() { fake.created(); }
    async actorToHandle() { return "@alice"; }
  },
}));
vi.mock("vue", async (original) => ({
  ...await original<typeof import("vue")>(),
  createApp: () => ({ mount: vi.fn(), use: vi.fn() }),
}));

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  fake.events = new EventTarget();
  fake.storage.clear();
  fake.restore.mockResolvedValue(false);
  fake.activate.mockResolvedValue(false);
  fake.completed.mockReturnValue(undefined);
  vi.stubGlobal("window", {
    parent: {},
    location: new URL("https://guard.example/"),
  });
  (await import("../src/ui/show.js")).clear();
});
afterEach(() => vi.unstubAllGlobals());

async function start(loginNonce?: string, loginCancelled?: { state?: string }) {
  await import("../src/index.js");
  await fake.listen.mock.calls[0][0]("https://app.example", loginNonce, loginCancelled);
  return fake.serve.mock.calls[0][0] as GuardedGraffiti;
}

it("connects anonymously without opening the browser permission dialog", async () => {
  const guarded = await start();
  expect(fake.created).toHaveBeenCalledOnce();
  expect(fake.activate).not.toHaveBeenCalled();
  const login = vi.fn();
  guarded.sessionEvents.addEventListener("login", login);
  fake.events.dispatchEvent(new CustomEvent("login", { detail: { session: { actor: "alice" } } }));
  expect(login).not.toHaveBeenCalled();
});

it("still connects anonymously after declining storage access on login return", async () => {
  const guarded = await start("login-nonce");
  expect(fake.activate).toHaveBeenCalledOnce();
  expect(fake.completed).not.toHaveBeenCalled();
  const login = vi.fn();
  guarded.sessionEvents.addEventListener("login", login);
  fake.events.dispatchEvent(new CustomEvent("login", { detail: { session: { actor: "alice" } } }));
  expect(login).not.toHaveBeenCalled();
});

it.each([true, false])("restores a remembered login without choosing the account again (silent access: %s)", async silent => {
  fake.storage.set("graffiti-guard:remember-login:https://app.example", "1");
  fake.storage.set("graffiti-guard:login-access-v3:alice", JSON.stringify([["https://app.example"]]));
  fake.restore.mockResolvedValue(silent);
  fake.activate.mockResolvedValue(true);
  const guarded = await start();
  expect(fake.activate).toHaveBeenCalledTimes(silent ? 0 : 1);
  if (!silent) expect(fake.activate).toHaveBeenCalledWith(true);
  expect(fake.completed).not.toHaveBeenCalled();
  const login = vi.fn();
  guarded.sessionEvents.addEventListener("login", login);
  fake.events.dispatchEvent(new CustomEvent("login", { detail: { session: { actor: "alice" } } }));
  fake.events.dispatchEvent(new CustomEvent("initialized"));
  expect(login.mock.calls[0][0].detail.session).toEqual({ actor: "alice", guardSites: [[]] });
  expect((await import("../src/ui/show.js")).componentState.component).toBeNull();
});

it("keeps the reminder if Continue is skipped, without exposing the account", async () => {
  const key = "graffiti-guard:remember-login:https://app.example";
  fake.storage.set(key, "1");
  const guarded = await start();
  expect(fake.activate).toHaveBeenCalledOnce();
  const login = vi.fn();
  guarded.sessionEvents.addEventListener("login", login);
  fake.events.dispatchEvent(new CustomEvent("login", { detail: { session: { actor: "alice" } } }));
  fake.events.dispatchEvent(new CustomEvent("initialized"));
  expect(login).not.toHaveBeenCalled();
  expect(fake.storage.get(key)).toBe("1");
});

it("never treats a reminder as site approval", async () => {
  const key = "graffiti-guard:remember-login:https://app.example";
  fake.storage.set(key, "1");
  fake.activate.mockResolvedValue(true);
  const guarded = await start();
  const login = vi.fn();
  guarded.sessionEvents.addEventListener("login", login);
  fake.events.dispatchEvent(new CustomEvent("login", { detail: { session: { actor: "alice" } } }));
  fake.events.dispatchEvent(new CustomEvent("initialized"));
  expect(login).not.toHaveBeenCalled();
  expect(fake.storage.has(key)).toBe(false);
});

it("reports cancellation before initialization without requesting cookies or granting identity", async () => {
  // Even if a parent supplies both fields, cancellation cannot redeem a success.
  const guarded = await start("login-nonce", { state: "nested-caller-state" });
  expect(fake.activate).not.toHaveBeenCalled();
  expect(fake.completed).not.toHaveBeenCalled();
  const events: { type: string; detail: unknown }[] = [];
  for (const type of ["login", "initialized"]) guarded.sessionEvents.addEventListener(type, event => {
    events.push({ type, detail: (event as CustomEvent).detail });
  });
  fake.events.dispatchEvent(new CustomEvent("login", { detail: { session: { actor: "alice" } } }));
  fake.events.dispatchEvent(new CustomEvent("initialized"));
  await vi.waitFor(() => expect(events).toEqual([
    { type: "login", detail: { error: new Error("Login was not completed"), state: "nested-caller-state" } },
    { type: "initialized", detail: null },
  ]));
  expect(fake.storage.size).toBe(0);
});

it("does not reopen cookie setup after a canceled login, even with a reminder", async () => {
  fake.storage.set("graffiti-guard:remember-login:https://app.example", "1");
  await start(undefined, { state: "canceled-login" });
  expect(fake.activate).not.toHaveBeenCalled();
});

it.each([true, false])("finishes the chosen login without another prompt (storage already allowed: %s)", async alreadyAllowed => {
  fake.restore.mockResolvedValue(alreadyAllowed);
  fake.activate.mockResolvedValue(true);
  const source = [{ id: "chat-v3", name: "Chat" }];
  fake.completed.mockReturnValue({ session: { actor: "alice" }, state: "caller-state", source });
  const guarded = await start("login-nonce");
  const events: { type: string; detail: unknown }[] = [];
  for (const type of ["login", "initialized"]) guarded.sessionEvents.addEventListener(type, event => {
    events.push({ type, detail: (event as CustomEvent).detail });
  });
  const { componentState } = await import("../src/ui/show.js");
  expect(fake.activate).toHaveBeenCalledTimes(alreadyAllowed ? 0 : 1);
  if (!alreadyAllowed) expect(fake.activate).toHaveBeenCalledWith(false);
  expect(fake.serve.mock.results[0].value.connect).toHaveBeenCalledWith({
    remoteWindow: window.parent,
    allowedOrigins: ["https://app.example"],
    stateId: "https://app.example",
  });
  fake.events.dispatchEvent(new CustomEvent("login", { detail: { session: { actor: "alice" } } }));
  fake.events.dispatchEvent(new CustomEvent("initialized"));
  expect(fake.completed).toHaveBeenCalledWith("login-nonce", "https://app.example");
  await vi.waitFor(() => expect(events).toMatchObject([
    { type: "login", detail: { session: { actor: "alice", guardSites: [["chat-v3"]] }, state: "caller-state" } },
    { type: "initialized" },
  ]));
  expect(fake.storage.get("graffiti-guard:remember-login:https://app.example")).toBe("1");
  expect(componentState.component).toBeNull();
});

it("does not grant access from a nonce without a verified login result", async () => {
  fake.restore.mockResolvedValue(true);
  const guarded = await start("login-nonce");
  const login = vi.fn();
  guarded.sessionEvents.addEventListener("login", login);
  fake.events.dispatchEvent(new CustomEvent("login", { detail: { session: { actor: "alice" } } }));
  fake.events.dispatchEvent(new CustomEvent("initialized"));
  expect(fake.completed).toHaveBeenCalledWith("login-nonce", "https://app.example");
  expect(login).not.toHaveBeenCalled();
  expect(fake.storage.size).toBe(0);
});
