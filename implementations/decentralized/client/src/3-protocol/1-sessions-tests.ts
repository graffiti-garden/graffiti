import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraffitiLoginEvent, GraffitiLogoutEvent } from "@graffiti-garden/api";
import { Authorization } from "../1-services/1-authorization";
import { Sessions } from "./1-sessions";
import type { LoginAttempt } from "./login-attempt";
import { GraffitiDecentralized } from "./4-graffiti";
import * as browserStorage from "./browser-storage";
import * as modal from "@graffiti-garden/modal";

export function sessionTests() {
  describe("Sessions", () => {
    const mocks = {
      cookies: new Map<string, string>(),
      close: vi.fn(),
      cancel: undefined as (() => void) | undefined,
    };

    function storage() {
      const values = new Map<string, string>();
      return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
      };
    }

    beforeEach(() => {
      mocks.cookies.clear();
      mocks.close.mockClear();
      mocks.cancel = undefined;
      vi.spyOn(browserStorage, "getBrowserStorageItem").mockImplementation(key => mocks.cookies.get(key));
      vi.spyOn(browserStorage, "setBrowserStorageItem").mockImplementation((key, value) => { mocks.cookies.set(key, value); });
      vi.spyOn(browserStorage, "removeBrowserStorageItem").mockImplementation(key => { mocks.cookies.delete(key); });
      vi.spyOn(modal, "GraffitiModal").mockImplementation(class {
        close = mocks.close;
        constructor(options: { onManualClose: () => void }) { mocks.cancel = options.onManualClose; }
      } as any);
      vi.stubGlobal("alert", vi.fn());
      vi.stubGlobal("window", {
        sessionStorage: storage(), localStorage: storage(),
        location: new URL("https://app.example/"), history: { replaceState: vi.fn() },
      });
    });
    afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

    class Probe extends GraffitiDecentralized {
      shown: { attempt: LoginAttempt; handle?: string }[] = [];
      get manager() { return this.sessions; }
      get didService() { return this.dids; }
      protected override async login_(attempt: LoginAttempt, handle?: string) {
        this.shown.push({ attempt, handle });
      }
    }

    it("rejects an overlapping login without replacing the first attempt", async () => {
      const graffiti = new Probe();
      let release!: () => void;
      const waiting = new Promise<void>((resolve) => { release = resolve; });
      vi.spyOn(graffiti, "actorToHandle").mockImplementation(async () => { await waiting; return "alice"; });
      const events: GraffitiLoginEvent["detail"][] = [];
      graffiti.sessionEvents.addEventListener("login", event => events.push((event as GraffitiLoginEvent).detail));
      const first = graffiti.login({ actor: "did:example:alice", state: "first" });
      await graffiti.login({ state: "second" });
      release();
      await first;
      expect(events).toEqual([{ error: expect.any(Error), state: "second" }]);
      expect(graffiti.shown.map(({ attempt }) => attempt.state)).toEqual(["first"]);
      mocks.cancel!();
      expect(events[1]).toMatchObject({ error: expect.any(Error), state: "first" });
    });

    it("keeps the request through a recoverable failure and does not close on restoration", async () => {
      const graffiti = new Probe();
      vi.spyOn(graffiti, "actorToHandle").mockResolvedValue("alice");
      vi.spyOn(graffiti.didService, "resolve").mockRejectedValue(new Error("Try again"));
      await graffiti.login({ state: "retry" });
      const attempt = graffiti.manager.loginAttempts.current!;
      const events: GraffitiLoginEvent["detail"][] = [];
      graffiti.sessionEvents.addEventListener("login", event => events.push((event as GraffitiLoginEvent).detail));
      await graffiti.manager.login("did:example:alice", attempt);
      await vi.waitFor(() => expect(graffiti.shown).toHaveLength(2));
      expect(graffiti.shown[1].attempt).toBe(attempt);
      expect(events).toEqual([]);
      graffiti.sessionEvents.dispatchEvent(new CustomEvent("login", { detail: { session: { actor: "did:example:other" } } }));
      expect(mocks.close).not.toHaveBeenCalled();
      graffiti.manager.loginAttempts.complete(attempt, { session: { actor: "did:example:alice" } });
      expect(events.at(-1)).toEqual({ session: { actor: "did:example:alice" }, state: "retry" });
      expect(mocks.close).toHaveBeenCalledOnce();
    });

    it("does not reopen a cancelled attempt after actor resolution finishes", async () => {
      const graffiti = new Probe();
      let release!: () => void;
      const waiting = new Promise<void>((resolve) => { release = resolve; });
      vi.spyOn(graffiti, "actorToHandle").mockImplementation(async () => { await waiting; return "alice"; });
      const login = graffiti.login({ actor: "did:example:alice", state: "cancel" });
      mocks.cancel!();
      release();
      await login;
      expect(graffiti.shown).toEqual([]);
    });

    function sessionFixture(completingLogin = false) {
      const authorization = {
        eventTarget: new EventTarget(), login: vi.fn(), logout: vi.fn(), endLogin: vi.fn(), completingLogin,
      };
      const sessions = new Sessions({
        authorization: authorization as unknown as Authorization,
        dids: { resolve: async () => ({ service: [
          { id: "#graffitiStorageBucket", type: "GraffitiStorageBucket", serviceEndpoint: "https://provider.example/bucket" },
          { id: "#graffitiPersonalInbox", type: "GraffitiInbox", serviceEndpoint: "https://provider.example/inbox" },
          { id: "#graffitiSharedInbox_0", type: "GraffitiInbox", serviceEndpoint: "https://provider.example/shared" },
        ] }) } as any,
        storageBuckets: { getAuthorizationEndpoint: async () => "oauth2:https://provider.example" } as any,
        inboxes: { getAuthorizationEndpoint: async () => "oauth2:https://provider.example" } as any,
      });
      const events: GraffitiLoginEvent["detail"][] = [];
      sessions.sessionEvents.addEventListener("login", event => events.push((event as GraffitiLoginEvent).detail));
      const ready = new Promise<void>(resolve => sessions.sessionEvents.addEventListener("initialized", () => resolve(), { once: true }));
      authorization.eventTarget.dispatchEvent(new CustomEvent("initialized"));
      return { sessions, authorization, events, ready };
    }

    it("resumes authorization with its request after reload, then restores without it", async () => {
      const first = sessionFixture();
      await first.ready;
      const attempt = first.sessions.loginAttempts.begin("redirect");
      await first.sessions.login("did:example:alice", attempt);
      expect(first.authorization.login.mock.calls[0][1]).toBe(attempt.id);
      expect(window.localStorage.getItem("graffiti-login-in-progress")).toBeNull();
      const resumed = sessionFixture(true);
      resumed.authorization.eventTarget.dispatchEvent(new CustomEvent("login", {
        detail: { loginId: attempt.id, token: "token" },
      }));
      await resumed.ready;
      expect(resumed.events.filter(e => e.state)).toEqual([
        { session: { actor: "did:example:alice" }, state: "redirect" },
      ]);
      expect(window.sessionStorage.getItem("graffiti-login-attempt")).toBeNull();
      const restored = sessionFixture();
      await restored.ready;
      expect(restored.events).toEqual([{ session: { actor: "did:example:alice" } }]);
      await restored.sessions.login("did:example:alice", restored.sessions.loginAttempts.begin("cached"));
      expect(restored.events.at(-1)?.state).toBe("cached");
    });

    it("carries the attempt through account creation before an actor is known", async () => {
      const first = sessionFixture();
      await first.ready;
      const attempt = first.sessions.loginAttempts.begin("create");
      first.sessions.loginAttempts.save(attempt);
      window.location = new URL("https://app.example/?actor=did%3Aexample%3Aalice") as any;
      const resumed = sessionFixture();
      await resumed.ready;
      expect(resumed.sessions.loginAttempts.current?.state).toBe("create");
      expect(resumed.authorization.login.mock.calls[0][1]).toBe(attempt.id);
    });

    it("ignores a late authorization callback for a cancelled attempt with the same actor", async () => {
      const { sessions, authorization, events, ready } = sessionFixture();
      await ready;
      const first = sessions.loginAttempts.begin("old");
      await sessions.login("did:example:alice", first);
      sessions.loginAttempts.complete(first, { error: new Error("Cancelled") });
      expect(authorization.endLogin.mock.calls).toEqual([[first.id]]);
      const second = sessions.loginAttempts.begin("new");
      await sessions.login("did:example:alice", second);
      authorization.eventTarget.dispatchEvent(new CustomEvent("login", { detail: { loginId: first.id, token: "old-token" } }));
      expect(events).toHaveLength(1);
      authorization.eventTarget.dispatchEvent(new CustomEvent("login", { detail: { loginId: second.id, token: "new-token" } }));
      expect(events.at(-1)).toEqual({ session: { actor: "did:example:alice" }, state: "new" });
      expect(authorization.endLogin.mock.calls).toEqual([[first.id], [second.id]]);
    });

    it("keeps independent pending login attempts in separate tabs", async () => {
      const first = sessionFixture();
      await first.ready;
      const firstStorage = window.sessionStorage;
      first.sessions.loginAttempts.save(first.sessions.loginAttempts.begin("tab-one"));
      Object.assign(window, { sessionStorage: storage() });
      const second = sessionFixture();
      await second.ready;
      expect(second.sessions.loginAttempts.current).toBeUndefined();
      second.sessions.loginAttempts.save(second.sessions.loginAttempts.begin("tab-two"));
      Object.assign(window, { sessionStorage: firstStorage });
      const resumed = sessionFixture(true);
      await resumed.ready;
      expect(resumed.sessions.loginAttempts.current?.state).toBe("tab-one");
    });

    it.each(["", "?actor="])("abandons a saved authorization on a normal visit (%s)", async search => {
      const first = sessionFixture();
      await first.ready;
      const attempt = first.sessions.loginAttempts.begin("abandoned");
      await first.sessions.login("did:example:alice", attempt);
      window.location = new URL(`https://app.example/${search}`) as any;
      const next = sessionFixture();
      await next.ready;
      expect(next.sessions.loginAttempts.current).toBeUndefined();
      expect(next.authorization.endLogin.mock.calls).toEqual([[attempt.id]]);
      expect(window.sessionStorage.getItem("graffiti-login-attempt")).toBeNull();
      expect(next.events).toEqual([]);
      expect(next.sessions.loginAttempts.begin("fresh").state).toBe("fresh");
    });

    it.each([undefined, 0, 1])("keeps logout correlation through multiple providers (failed step=%s)", async failedStep => {
      const { sessions, authorization, ready } = sessionFixture();
      await ready;
      const actor = "did:example:alice";
      const attempt = sessions.loginAttempts.begin("login-request");
      await sessions.login(actor, attempt);
      authorization.eventTarget.dispatchEvent(new CustomEvent("login", {
        detail: { loginId: attempt.id, token: "first-token" },
      }));
      const stored = JSON.parse(mocks.cookies.get("graffiti-sessions-logged-in")!);
      stored[0].tokens.push("second-token");
      stored[0].servicesByAuthorization.push(["oauth2:https://second.example", []]);
      mocks.cookies.set("graffiti-sessions-logged-in", JSON.stringify(stored));
      const events: GraffitiLogoutEvent["detail"][] = [];
      sessions.sessionEvents.addEventListener("logout", event => events.push((event as GraffitiLogoutEvent).detail));

      authorization.logout.mockImplementation(async () => {
        if (authorization.logout.mock.calls.length - 1 === failedStep) throw new Error("Revocation failed");
      });
      await sessions.logout(actor, { state: "logout-request" });
      expect(authorization.logout.mock.calls).toEqual([
        ["oauth2:https://second.example", "second-token"],
        ["oauth2:https://provider.example", "first-token"],
      ].slice(0, failedStep === 0 ? 1 : 2));
      expect(events).toEqual([{
        actor, state: "logout-request", ...(failedStep === undefined ? {} : { error: expect.any(Error) }),
      }]);
      expect(() => sessions.resolveSession({ actor })).toThrow("Not logged in");
      expect(events.at(-1)).toEqual({ actor });
    });

    it("returns the public logout state when the session is missing", async () => {
      const graffiti = new Probe();
      const events: GraffitiLogoutEvent["detail"][] = [];
      graffiti.sessionEvents.addEventListener("logout", event => events.push((event as GraffitiLogoutEvent).detail));
      await graffiti.logout({ actor: "did:example:missing" }, { state: "missing-request" });
      expect(events).toEqual([{
        actor: "did:example:missing", state: "missing-request", error: expect.any(Error),
      }]);
    });

    it("reports a malformed account return without blocking a fresh login", async () => {
      const first = sessionFixture();
      await first.ready;
      first.sessions.loginAttempts.save(first.sessions.loginAttempts.begin("create"));
      window.location = new URL("https://app.example/?actor=%25") as any;
      const resumed = sessionFixture();
      await resumed.ready;
      expect(resumed.events).toEqual([{ error: expect.any(URIError), state: "create" }]);
      expect(resumed.sessions.loginAttempts.begin("fresh").state).toBe("fresh");
      expect(window.sessionStorage.getItem("graffiti-login-attempt")).toBeNull();
    });

    it("keeps simultaneous logouts independent", async () => {
      const { sessions, authorization, ready } = sessionFixture();
      await ready;
      const actors = ["did:example:alice", "did:example:bob"];
      for (const actor of actors) {
        const attempt = sessions.loginAttempts.begin();
        await sessions.login(actor, attempt);
        authorization.eventTarget.dispatchEvent(new CustomEvent("login", {
          detail: { loginId: attempt.id, token: actor + "-token" },
        }));
      }
      let release!: () => void;
      const waiting = new Promise<void>(resolve => { release = resolve; });
      authorization.logout.mockImplementation(async () => { await waiting; });
      const events: GraffitiLogoutEvent["detail"][] = [];
      sessions.sessionEvents.addEventListener("logout", event => events.push((event as GraffitiLogoutEvent).detail));
      const pending = actors.map((actor, index) => sessions.logout(actor, { state: `logout-${index}` }));
      expect(authorization.logout.mock.calls).toEqual(actors.map(actor => [
        "oauth2:https://provider.example", actor + "-token",
      ]));
      expect(events).toEqual([]);
      release();
      await Promise.all(pending);
      expect(events).toEqual(actors.map((actor, index) => ({ actor, state: `logout-${index}` })));
    });
  });
}
