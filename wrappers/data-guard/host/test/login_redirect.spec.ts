import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRedirectUrl } from "../src/bootstrap/login_redirect.js";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } as unknown as Storage;
}

beforeEach(() => {
  vi.stubGlobal("sessionStorage", memoryStorage());
  vi.stubGlobal("localStorage", memoryStorage());
});

describe("login redirects", () => {
  it("accepts and normalizes only HTTP redirects", () => {
    expect(
      getRedirectUrl(
        new URL(
          "https://guard.example/?redirectUrl=HTTPS%3A%2F%2FExample.com%3A443%2Fchat",
        ),
      ),
    ).toBe("https://example.com/chat");
    expect(
      getRedirectUrl(
        new URL(
          "https://guard.example/?redirectUrl=javascript%3Aalert(document.domain)",
        ),
      ),
    ).toBeNull();
  });

  it("rejects and clears an unsafe stored redirect", () => {
    const value = JSON.stringify({
      redirectUrl: "javascript:alert(document.domain)",
      expiresAt: Date.now() + 60_000,
    });
    sessionStorage.setItem("graffiti-guard-redirect-url", value);
    localStorage.setItem("graffiti-guard-redirect-url", value);

    expect(getRedirectUrl(new URL("https://guard.example/"))).toBeNull();
    expect(sessionStorage.getItem("graffiti-guard-redirect-url")).toBeNull();
    expect(localStorage.getItem("graffiti-guard-redirect-url")).toBeNull();
  });
});
