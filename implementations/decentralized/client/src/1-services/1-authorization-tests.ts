import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Authorization } from "./1-authorization";
import * as oauth from "openid-client";
import { PendingLoginStorage } from "./pending-login-storage";
import { Sessions } from "../3-protocol/1-sessions";
import type { GraffitiSessionInitializedEvent } from "@graffiti-garden/api";

export function authorizationTests() {
  describe("Authorization", () => {
    function storage() {
      const values = new Map<string, string>();
      return {
        get length() { return values.size; },
        key: (i: number) => [...values.keys()][i] ?? null,
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
      };
    }
    beforeEach(() => {
      vi.spyOn(oauth, "discovery").mockResolvedValue({} as any);
      vi.spyOn(oauth, "randomState").mockReturnValue("oauth-state");
      vi.spyOn(oauth, "buildAuthorizationUrl").mockImplementation((_config, params) =>
        new URL("https://provider.example/authorize?" + new URLSearchParams(params)));
      vi.spyOn(oauth, "authorizationCodeGrant").mockResolvedValue({ access_token: "token" } as any);
      vi.spyOn(oauth, "tokenRevocation").mockResolvedValue(undefined);
      vi.stubGlobal("window", {
        location: Object.assign(new URL("https://app.example/#room"), { assign: vi.fn(), replace: vi.fn() }),
        sessionStorage: storage(), localStorage: storage(), history: { replaceState: vi.fn() },
      });
      vi.stubGlobal("document", { title: "Test", cookie: "" });
    });
    afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

    it.each([false, true])("resumes OAuth in the same tab with its attempt identity (failure=%s)", async failure => {
      const first = new Authorization();
      await first.login("oauth2:https://provider.example", "attempt-123", ["https://provider.example/bucket"], "assign");
      expect(window.localStorage.getItem("graffiti-pending-oauth:oauth-state")).toContain("attempt-123");
      expect(window.sessionStorage.getItem("graffiti-auth-oauth2-data")).toBeNull();
      Object.assign(window, { sessionStorage: storage() }); // Firefox can lose this during the redirect.
      if (failure) vi.mocked(oauth.authorizationCodeGrant).mockRejectedValueOnce(new Error("Denied"));
      window.location = new URL("https://app.example/?code=code&state=oauth-state") as any;
      const resumed = new Authorization();
      expect(resumed.completingLoginId).toBe("attempt-123");
      const seen: unknown[] = [];
      resumed.eventTarget.addEventListener("login", event => seen.push((event as CustomEvent).detail));
      await new Promise<void>(resolve => resumed.eventTarget.addEventListener("initialized", () => resolve(), { once: true }));
      expect(seen).toEqual([failure
        ? { loginId: "attempt-123", error: expect.any(Error) }
        : { loginId: "attempt-123", token: "token" }]);
      expect(window.history.replaceState).toHaveBeenCalledWith({}, "Test", "https://app.example/#room");
      expect(window.localStorage.getItem("graffiti-pending-oauth:oauth-state")).toBeNull();
    });

    it.each(["code=fixture", "actor=did%3Aexample%3Aalice"])(
      "reports a missing attempt through the public API instead of exchanging tokens (%s)", async callback => {
        const first = new Authorization();
        await first.login("oauth2:https://provider.example", "missing-attempt", [], "assign");
        window.location = new URL(`https://app.example/?${callback}&state=oauth-state`) as any;
        // Make the real URL restoration visible to Sessions, just as in a browser.
        vi.mocked(window.history.replaceState).mockImplementation((_state, _title, url) => {
          window.location = new URL(String(url)) as any;
        });
        const authorization = new Authorization();
        const sessions = new Sessions({ authorization, dids: {} as any, storageBuckets: {} as any, inboxes: {} as any });
        const login = vi.fn();
        sessions.sessionEvents.addEventListener("login", login);
        const detail = await new Promise<GraffitiSessionInitializedEvent["detail"]>(resolve =>
          sessions.sessionEvents.addEventListener("initialized", event => resolve((event as GraffitiSessionInitializedEvent).detail), { once: true }));
        expect(detail?.error?.message).toContain("missing login attempt");
        expect(login).not.toHaveBeenCalled();
        expect(oauth.authorizationCodeGrant).not.toHaveBeenCalled();
        expect(sessions.loginAttempts.current).toBeUndefined();
      },
    );

    it.each(["code=fixture", "actor=did%3Aexample%3Aalice"])(
      "reports lost OAuth state through the public API (%s)", async callback => {
        window.location = new URL(`https://app.example/?${callback}&state=unknown-state`) as any;
        const authorization = new Authorization();
        const sessions = new Sessions({ authorization, dids: {} as any, storageBuckets: {} as any, inboxes: {} as any });
        const login = vi.fn();
        sessions.sessionEvents.addEventListener("login", login);
        const detail = await new Promise<GraffitiSessionInitializedEvent["detail"]>(resolve =>
          sessions.sessionEvents.addEventListener("initialized", event => resolve((event as GraffitiSessionInitializedEvent).detail), { once: true }));
        expect(detail?.error?.message).toContain("missing authorization state");
        expect(login).not.toHaveBeenCalled();
        expect(oauth.authorizationCodeGrant).not.toHaveBeenCalled();
        expect(sessions.loginAttempts.current).toBeUndefined();
      },
    );

    it("keeps simultaneous OAuth redirects independent when sessionStorage disappears", async () => {
      vi.mocked(oauth.randomState).mockReturnValueOnce("state-one").mockReturnValueOnce("state-two");
      const first = new Authorization();
      await first.login("oauth2:https://provider.example", "one", [], "assign");
      const second = new Authorization();
      await second.login("oauth2:https://provider.example", "two", [], "assign");
      Object.assign(window, { sessionStorage: storage() });
      for (const [state, id] of [["state-one", "one"], ["state-two", "two"]]) {
        window.location = new URL(`https://app.example/?code=fixture&state=${state}`) as any;
        const resumed = new Authorization();
        expect(resumed.completingLoginId).toBe(id);
        await new Promise<void>(resolve => resumed.eventTarget.addEventListener("initialized", () => resolve(), { once: true }));
      }
    });

    it("does not consume OAuth state on a different callback path", async () => {
      const first = new Authorization();
      await first.login("oauth2:https://provider.example", "right-path", [], "assign");
      window.location = new URL("https://app.example/elsewhere?code=fixture&state=oauth-state") as any;
      const wrongPath = new Authorization();
      expect(wrongPath.completingLoginId).toBeUndefined();
      await new Promise<void>(resolve => wrongPath.eventTarget.addEventListener("initialized", () => resolve(), { once: true }));
      expect(window.localStorage.getItem("graffiti-pending-oauth:oauth-state")).not.toBeNull();
      window.location = new URL("https://app.example/?code=fixture&state=oauth-state") as any;
      const resumed = new Authorization();
      expect(resumed.completingLoginId).toBe("right-path");
      await new Promise<void>(resolve => resumed.eventTarget.addEventListener("initialized", () => resolve(), { once: true }));
      expect(window.localStorage.getItem("graffiti-pending-oauth:oauth-state")).toBeNull();
    });

    it("restores the original route and attempt when a provider selects a different actor", async () => {
      const first = new Authorization();
      await first.login("oauth2:https://provider.example", "choose-account", [], "assign");
      window.location = new URL("https://app.example/?actor=did%3Aexample%3Abob&state=oauth-state") as any;
      const resumed = new Authorization();
      expect(resumed.completingLoginId).toBe("choose-account");
      expect(window.history.replaceState).toHaveBeenCalledWith({}, "Test", "https://app.example/?actor=did%3Aexample%3Abob#room");
      await new Promise<void>(resolve => resumed.eventTarget.addEventListener("initialized", () => resolve(), { once: true }));
      expect(oauth.authorizationCodeGrant).not.toHaveBeenCalled();
    });

    it("expires abandoned redirect records without consuming another active redirect", () => {
      const pending = new PendingLoginStorage("test-pending:");
      pending.save("old", { state: "old" });
      vi.spyOn(Date, "now").mockReturnValue(Date.now() + 10 * 60 * 1000 + 1);
      pending.save("new", { state: "new" });
      expect(window.localStorage.getItem("test-pending:old")).toBeNull();
      expect(pending.load("missing")).toBeUndefined();
      expect(pending.load("new")).toEqual({ state: "new" });
      pending.remove("new");
      expect(pending.load("new")).toBeUndefined();
    });

    it("does not navigate after an attempt is cancelled during provider discovery", async () => {
      let release!: () => void;
      const waiting = new Promise<void>(resolve => { release = resolve; });
      vi.mocked(oauth.discovery).mockImplementationOnce(async () => { await waiting; return {} as any; });
      const authorization = new Authorization();
      const login = authorization.login("oauth2:https://provider.example", "cancelled", [], "assign");
      authorization.endLogin("cancelled");
      release();
      await login;
      expect(window.location.assign).not.toHaveBeenCalled();
      expect(window.localStorage.getItem("graffiti-pending-oauth:oauth-state")).toBeNull();
    });

    it.each([false, true])("awaits token revocation and propagates its failure (failure=%s)", async failure => {
      const authorization = new Authorization();
      if (failure) vi.mocked(oauth.tokenRevocation).mockRejectedValueOnce(new Error("Revocation failed"));
      const logout = authorization.logout("oauth2:https://provider.example", "token");
      if (failure) await expect(logout).rejects.toThrow("Revocation failed");
      else await expect(logout).resolves.toBeUndefined();
      expect(oauth.tokenRevocation).toHaveBeenCalledWith(expect.anything(), "token");
    });

    it("reports a failed Node OAuth callback through its login event", async () => {
      vi.stubGlobal("window", undefined);
      const output = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        const authorization = new Authorization();
        const seen: unknown[] = [];
        authorization.eventTarget.addEventListener("login", event => seen.push((event as CustomEvent).detail));
        vi.mocked(oauth.authorizationCodeGrant).mockRejectedValueOnce(new Error("Denied"));
        const login = authorization.login("oauth2:https://provider.example", "node-attempt", [], "assign");
        await vi.waitFor(() => expect(output).toHaveBeenCalledTimes(2));
        const authorizeUrl = new URL(String(output.mock.calls[1][0]));
        const callback = new URL(authorizeUrl.searchParams.get("redirect_uri")!);
        callback.search = "code=code&state=oauth-state";
        // The callback server closes its connections after processing the response.
        await fetch(callback).catch(() => undefined);
        await login;
        expect(seen).toEqual([{ loginId: "node-attempt", error: expect.any(Error) }]);
      } finally {
        output.mockRestore();
      }
    });
  });
}
