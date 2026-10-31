import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Authorization } from "./1-authorization";
import * as oauth from "openid-client";

export function authorizationTests() {
  describe("Authorization", () => {
    function storage() {
      const values = new Map<string, string>();
      return {
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
      vi.stubGlobal("document", { title: "Test" });
    });
    afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

    it.each([false, true])("resumes OAuth in the same tab with its attempt identity (failure=%s)", async failure => {
      const first = new Authorization();
      await first.login("oauth2:https://provider.example", "attempt-123", ["https://provider.example/bucket"], "assign");
      expect(window.sessionStorage.getItem("graffiti-auth-oauth2-data")).toContain("attempt-123");
      expect(window.localStorage.getItem("graffiti-auth-oauth2-data")).toBeNull();
      if (failure) vi.mocked(oauth.authorizationCodeGrant).mockRejectedValueOnce(new Error("Denied"));
      window.location = new URL("https://app.example/?code=code&state=oauth-state") as any;
      const resumed = new Authorization();
      expect(resumed.completingLogin).toBe(true);
      const seen: unknown[] = [];
      resumed.eventTarget.addEventListener("login", event => seen.push((event as CustomEvent).detail));
      await new Promise<void>(resolve => resumed.eventTarget.addEventListener("initialized", () => resolve(), { once: true }));
      expect(seen).toEqual([failure
        ? { loginId: "attempt-123", error: expect.any(Error) }
        : { loginId: "attempt-123", token: "token" }]);
      expect(window.history.replaceState).toHaveBeenCalledWith({}, "Test", "https://app.example/#room");
      expect(window.sessionStorage.getItem("graffiti-auth-oauth2-data")).toBeNull();
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
      expect(window.sessionStorage.getItem("graffiti-auth-oauth2-data")).toBeNull();
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
