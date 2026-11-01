import type { Graffiti, GraffitiLoginEvent } from "@graffiti-garden/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { GuardedGraffiti } from "../src/core/graffiti.js";
import type { Guard } from "../src/core/guard.js";
import { LoginAccess } from "../src/core/login-access.js";
import { sourceFromContext } from "../src/core/source.js";
import LoginPrompt from "../src/ui/LoginPrompt.vue";
import { clear, componentState } from "../src/ui/show.js";
import { requestLoginRedirect, setVisible } from "../src/bootstrap/protocol.js";

vi.mock("../src/bootstrap/protocol.js", () => ({
  setVisible: vi.fn(),
  requestLoginRedirect: vi.fn(),
}));

const origin = "https://app.example";
const child = [{ id: "chat", name: "Chat" }];
const other = [{ id: "other", name: "Other" }];

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } as Storage;
}

function fixture(
  actorToHandle = vi.fn(async (actor: string) => `@${actor}`),
  access = new LoginAccess(memoryStorage()),
  initialLogin?: GraffitiLoginEvent["detail"] & { source: typeof child },
) {
  const events = new EventTarget();
  const graffiti = {
    sessionEvents: events,
    actorToHandle,
    login: vi.fn(),
  } as unknown as Graffiti;
  const guarded = new GuardedGraffiti(
    graffiti, {} as Guard, access, origin, initialLogin,
  );
  return { events, access, guarded, actorToHandle };
}

function restored(events: EventTarget, ...actors: string[]) {
  for (const actor of actors) {
    events.dispatchEvent(new CustomEvent("login", {
      detail: { session: { actor } },
    }));
  }
  events.dispatchEvent(new CustomEvent("initialized"));
}

beforeEach(() => {
  vi.mocked(setVisible).mockReset();
  vi.mocked(requestLoginRedirect).mockReset();
  clear();
});

describe("embedded site login", () => {
  it("approves the returned identity in the embedded storage without another prompt", async () => {
    const access = new LoginAccess(memoryStorage());
    const { events, guarded } = fixture(undefined, access, {
      session: { actor: "alice" }, source: child, state: "returning",
    });
    const results: GraffitiLoginEvent["detail"][] = [];
    const initialized = vi.fn();
    guarded.sessionEvents.addEventListener("login", event => results.push((event as CustomEvent).detail));
    guarded.sessionEvents.addEventListener("initialized", initialized);
    restored(events, "alice", "bob");

    await vi.waitFor(() => expect(initialized).toHaveBeenCalledOnce());
    expect(results).toEqual([{
      session: { actor: "alice", guardSites: [["chat"]] }, state: "returning",
    }]);
    expect(access.allows("alice", sourceFromContext(origin, { source: child }))).toBe(true);
    expect(access.allows("alice", sourceFromContext(origin, {}))).toBe(true);
    expect(access.allows("alice", sourceFromContext(origin, { source: other }))).toBe(false);
    expect(access.allows("bob", sourceFromContext(origin, { source: child }))).toBe(false);
    expect(componentState.component).toBeNull();
    expect(setVisible).not.toHaveBeenCalled();
  });

  it("does not approve a returned account that is no longer signed in", async () => {
    const { events, guarded, access } = fixture(undefined, undefined, {
      session: { actor: "alice" }, source: child, state: "returning",
    });
    const login = vi.fn();
    guarded.sessionEvents.addEventListener("login", login);
    restored(events, "bob");
    await vi.waitFor(() => expect(login).toHaveBeenCalledOnce());
    expect(login.mock.calls[0][0].detail).toMatchObject({ error: expect.any(Error), state: "returning" });
    expect(access.allows("alice", sourceFromContext(origin, { source: child }))).toBe(false);
    expect(componentState.component).toBeNull();
  });

  it("can finish a returned login while another request waits for initialization", async () => {
    const { events, guarded } = fixture(undefined, undefined, {
      session: { actor: "alice" }, source: child, state: "returning",
    });
    const results: GraffitiLoginEvent["detail"][] = [];
    guarded.sessionEvents.addEventListener("login", event => results.push((event as CustomEvent).detail));
    const next = guarded.login({ state: "next", source: other });
    await Promise.resolve();
    restored(events, "alice");

    // Completing the return releases initialization and then the waiting call.
    await vi.waitFor(() => expect(componentState.props.site).toBe("app.example › Other"));
    (componentState.props.choose as (actor: string) => void)("alice");
    await next;
    expect(results).toMatchObject([
      { state: "returning", session: { actor: "alice" } },
      { state: "next", session: { actor: "alice" } },
    ]);
  });

  it("redirects anonymous login before waiting for account restoration", async () => {
    const { events, guarded } = fixture(undefined, new LoginAccess());
    await expect(guarded.login({actor: "alice", source: child }))
      .resolves.toBeUndefined();
    expect(requestLoginRedirect).toHaveBeenCalledWith({ actor: "alice", source: child, chooseAccount: true });
    expect(componentState.component).toBeNull();

    const login = vi.fn();
    guarded.sessionEvents.addEventListener("login", login);
    restored(events, "alice");
    expect(login).not.toHaveBeenCalled();
  });

  it("lets an existing actor approve only the chosen child site", async () => {
    const { events, access, guarded } = fixture();
    restored(events, "alice", "bob");
    const login = guarded.login({actor: "alice", source: child });

    await vi.waitFor(() => expect(componentState.component).toBe(LoginPrompt));
    expect(componentState.props.accounts).toEqual([
      { actor: "alice", handle: "@alice" },
      { actor: "bob", handle: "@bob" },
    ]);
    (componentState.props.choose as (actor: string) => void)("alice");
    await login;

    expect(access.allows("alice", sourceFromContext(origin, { source: child }))).toBe(true);
    expect(access.allows("alice", sourceFromContext(origin, { source: other }))).toBe(false);
    expect(access.allows("bob", sourceFromContext(origin, { source: child }))).toBe(false);
  });

  it("offers account choice on an explicit login even when the account is approved", async () => {
    const { events, access, guarded } = fixture();
    access.grant("alice", sourceFromContext(origin, { source: child }));
    restored(events, "alice");
    const logins: { actor: string; state?: string }[] = [];
    guarded.sessionEvents.addEventListener("login", (event) => {
      const { session, state } = (event as CustomEvent).detail;
      logins.push({ actor: session.actor, state });
    });

    const login = guarded.login({actor: "alice", state: "request-1", source: child });
    await vi.waitFor(() => expect(componentState.component).toBe(LoginPrompt));
    expect(logins).toEqual([]);
    (componentState.props.choose as (actor: string) => void)("alice");
    await login;
    expect(logins).toEqual([{ actor: "alice", state: "request-1" }]);
  });

  it("lets an approved account open sign-in for another account", async () => {
    const { events, access, guarded } = fixture();
    access.grant("alice", sourceFromContext(origin, { source: child }));
    restored(events, "alice");

    const login = guarded.login({ source: child });
    await vi.waitFor(() => expect(componentState.component).toBe(LoginPrompt));
    (componentState.props.loginAnother as () => void)();
    await expect(login).resolves.toBeUndefined();
    expect(requestLoginRedirect).toHaveBeenCalledWith({ actor: undefined, source: child });
  });

  it("redirects a fresh sign-in without an extra guard prompt", async () => {
    const { events, guarded, access } = fixture();
    restored(events);
    await expect(guarded.login({ source: child })).resolves.toBeUndefined();
    expect(requestLoginRedirect).toHaveBeenCalledWith({ actor: undefined, source: child, chooseAccount: true });
    expect(componentState.component).toBeNull();
    expect(setVisible).not.toHaveBeenCalled();
    expect(access.allows("alice", sourceFromContext(origin, { source: child }))).toBe(false);
  });

  it("carries the requested actor into a fresh sign-in redirect", async () => {
    const { events, guarded } = fixture();
    restored(events, "alice");
    await expect(guarded.login({actor: "bob", source: child }))
      .resolves.toBeUndefined();
    expect(requestLoginRedirect).toHaveBeenCalledWith({ actor: "bob", source: child, chooseAccount: true });
    expect(componentState.component).toBeNull();
  });

  it("disables unidentified accounts while other handles load independently", async () => {
    let finish!: (handle: string) => void;
    const lookup = vi.fn((actor: string) => actor === "alice"
      ? new Promise<string>(resolve => { finish = resolve; })
      : actor === "bob" ? Promise.resolve("@bob") : Promise.reject(new Error("unavailable")));
    const { events, guarded } = fixture(lookup);
    restored(events, "alice", "bob", "carol");
    const login = guarded.login({ source: child });

    await vi.waitFor(() => expect(componentState.component).toBe(LoginPrompt));
    const render = () => renderToString(createSSRApp({ render: () => h(LoginPrompt, componentState.props) }));
    let html = await render();
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Account loading…<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Account unavailable<\/button>/);
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>@bob<\/button>/);
    finish("@alice");
    await vi.waitFor(() => expect(componentState.props.accounts).toContainEqual({ actor: "alice", handle: "@alice" }));
    html = await render();
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>@alice<\/button>/);
    (componentState.props.choose as (actor: string) => void)("alice");
    await login;
    expect(lookup).toHaveBeenCalledWith("alice");
  });

  it("does not let an old handle lookup replace a later account chooser", async () => {
    let finishFirst!: (handle: string) => void;
    let lookups = 0;
    const lookup = vi.fn(() => ++lookups === 1
      ? new Promise<string>((resolve) => { finishFirst = resolve; })
      : Promise.resolve("@current"));
    const { events, guarded } = fixture(lookup);
    restored(events, "alice");

    const first = guarded.login({ source: child });
    await vi.waitFor(() => expect(componentState.component).toBe(LoginPrompt));
    (componentState.props.cancel as () => void)();
    await first;

    const second = guarded.login({ source: other });
    await vi.waitFor(() => expect(componentState.props.accounts).toEqual([
      { actor: "alice", handle: "@current" },
    ]));
    const current = componentState.props;
    finishFirst("@old");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(componentState.props).toBe(current);
    expect(componentState.props.site).toBe("app.example › Other");
    (componentState.props.cancel as () => void)();
    await second;
  });

  it("redirects in the same tab when choosing to sign in with another account", async () => {
    const { events, guarded } = fixture();
    restored(events, "alice");
    const login = guarded.login({actor: "alice", source: child });

    await vi.waitFor(() => expect(componentState.component).toBe(LoginPrompt));
    (componentState.props.loginAnother as () => void)();
    await expect(login).resolves.toBeUndefined();
    expect(requestLoginRedirect).toHaveBeenCalledWith({ actor: undefined, source: child });
    expect(componentState.component).toBeNull();
  });

  it("does not grant a chosen account after an observed logout", async () => {
    const { events, access, guarded } = fixture();
    restored(events, "alice");
    const seen: string[] = [];
    guarded.sessionEvents.addEventListener("login", (event) => {
      if (!(event as CustomEvent).detail.error) seen.push("login");
    });
    guarded.sessionEvents.addEventListener("logout", () => seen.push("logout"));
    const login = guarded.login({ source: child });

    await vi.waitFor(() => expect(componentState.component).toBe(LoginPrompt));
    events.dispatchEvent(new CustomEvent("logout", {
      detail: { actor: "alice" },
    }));
    (componentState.props.choose as (actor: string) => void)("alice");
    await login;

    expect(access.allows("alice", sourceFromContext(origin, { source: child }))).toBe(false);
    expect(seen).toEqual([]);
  });
});
