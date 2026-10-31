import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRedirectUrl } from "../src/bootstrap/login_redirect.js";

beforeEach(() => {
  vi.stubGlobal("window", { history: { replaceState: vi.fn() } });
});

afterEach(() => vi.unstubAllGlobals());

describe("login redirects", () => {
  it("restores a large return URL from the fragment without sending it to the guard", () => {
    const returnUrl = `https://app.example/#${"x".repeat(100_000)}`;
    const loginUrl = new URL("https://guard.example/");
    loginUrl.hash = new URLSearchParams({
      guardLogin: "1",
      redirectUrl: returnUrl,
      suggestedActor: "alice",
    }).toString();

    expect(loginUrl.pathname + loginUrl.search).toBe("/");
    expect(getRedirectUrl(loginUrl)).toBe(returnUrl);
    expect(getRedirectUrl(new URL("https://guard.example/"))).toBeNull();
    expect(getRedirectUrl(new URL(loginUrl))).toBe(returnUrl);
    expect(window.history.replaceState).not.toHaveBeenCalled();
  });

  it("accepts and normalizes only HTTP fragment redirects", () => {
    expect(getRedirectUrl(new URL("https://guard.example/?redirectUrl=https%3A%2F%2Fapp.example"))).toBeNull();
    expect(
      getRedirectUrl(
        new URL(
          "https://guard.example/#redirectUrl=HTTPS%3A%2F%2FExample.com%3A443%2Fchat",
        ),
      ),
    ).toBe("https://example.com/chat");
    expect(
      getRedirectUrl(
        new URL(
          "https://guard.example/#redirectUrl=javascript%3Aalert(document.domain)",
        ),
      ),
    ).toBeNull();
    expect(
      getRedirectUrl(
        new URL("https://guard.example/#redirectUrl=javascript%3Aalert(1)"),
      ),
    ).toBeNull();
  });
});
