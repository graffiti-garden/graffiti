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

async function start(loginNonce?: string) {
  await import("../src/index.js");
  await fake.listen.mock.calls[0][0]("https://app.example", loginNonce);
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

it.each([true, false])("finishes returned-login consent before initialization (approve: %s)", async approve => {
  fake.restore.mockResolvedValue(true);
  const source = [{ id: "chat-v3", name: "Chat" }];
  fake.completed.mockReturnValue({ session: { actor: "alice" }, state: "caller-state", source });
  const guarded = await start("login-nonce");
  const events: { type: string; detail: unknown }[] = [];
  for (const type of ["login", "initialized"]) guarded.sessionEvents.addEventListener(type, event => {
    events.push({ type, detail: (event as CustomEvent).detail });
  });
  const { componentState } = await import("../src/ui/show.js");
  expect(fake.activate).not.toHaveBeenCalled();
  expect(fake.serve.mock.results[0].value.connect).toHaveBeenCalledWith({
    remoteWindow: window.parent,
    allowedOrigins: ["https://app.example"],
    stateId: "https://app.example",
  });
  fake.events.dispatchEvent(new CustomEvent("login", { detail: { session: { actor: "alice" } } }));
  fake.events.dispatchEvent(new CustomEvent("initialized"));
  expect(fake.completed).toHaveBeenCalledWith("login-nonce", "https://app.example");
  // The return nonce by itself grants nothing; this is the usual login prompt.
  await vi.waitFor(() => expect(componentState.props.site).toBe("app.example › Chat"));
  expect(events).toEqual([]);
  if (approve) (componentState.props.choose as (actor: string) => void)("alice");
  else (componentState.props.cancel as () => void)();
  await vi.waitFor(() => expect(events).toMatchObject([
    { type: "login", detail: approve
      ? { session: { actor: "alice", guardSites: [["chat-v3"]] }, state: "caller-state" }
      : { error: expect.any(Error), state: "caller-state" } },
    { type: "initialized" },
  ]));
});
