import { describe, expect, it } from "vitest";
import { encodeGuardSiteId } from "../../client/src/source.js";
import { auditOptions } from "../src/bootstrap/audit.js";
import { siteStamp } from "../src/core/provenance.js";
import { sourceFromContext } from "../src/core/source.js";

describe("guard sources", () => {
  it("exposes the stamp's ID encoding without losing boundaries between site IDs", () => {
    const origin = "https://example.com";
    const path = [origin, 'room","nested', "É 🌱"] as const;
    const source = sourceFromContext(origin, {
      source: path.slice(1).map(id => ({ id, name: "Document" })),
    });
    expect(encodeGuardSiteId([origin])).toBe('["https://example.com"]');
    expect(siteStamp(source).id).toBe(encodeGuardSiteId(path));
    expect(encodeGuardSiteId(path)).not.toBe(encodeGuardSiteId([origin, "room", "nested", "É 🌱"]));
  });

  it("uses the verified origin and ordered IDs for identity", () => {
    const first = sourceFromContext("https://example.com", {
      source: [
        { id: "browser", name: "Browser" },
        { id: "document", name: "Document" },
      ],
    });
    const renamed = sourceFromContext("https://example.com", {
      source: [
        { id: "browser", name: "Renamed browser" },
        { id: "document", name: "Renamed document" },
      ],
    });
    const reordered = sourceFromContext("https://example.com", {
      source: [
        { id: "document", name: "Document" },
        { id: "browser", name: "Browser" },
      ],
    });

    expect(renamed.key).toBe(first.key);
    expect(reordered.key).not.toBe(first.key);
    expect(sourceFromContext("https://elsewhere.example", {}).key).not.toBe(
      sourceFromContext("https://example.com", {}).key,
    );
  });

  it("rejects malformed source paths", () => {
    expect(() =>
      sourceFromContext("https://example.com", {
        source: [{ id: "document" }],
      }),
    ).toThrow(TypeError);
  });

  it("reads audit filters and redirect from the URL", () => {
    const url = new URL("https://guard.graffiti.garden/");
    url.searchParams.set("redirectUrl", "https://example.com/chat?room=one");
    url.searchParams.set("actor", "actor:one");
    url.searchParams.set(
      "source",
      JSON.stringify([{ id: "chat", name: "Chat" }]),
    );

    expect(auditOptions(url)).toEqual({
      actor: "actor:one",
      redirectUrl: new URL("https://example.com/chat?room=one"),
      source: {
        key: '["https://example.com","chat"]',
        origin: "https://example.com",
        path: [{ id: "chat", name: "Chat" }],
      },
    });
  });

  it("reads a large audit return URL from the fragment", () => {
    const returnUrl = `https://app.example/#${"x".repeat(100_000)}`;
    const url = new URL("https://guard.graffiti.garden/");
    url.hash = new URLSearchParams({
      redirectUrl: returnUrl,
      actor: "actor:one",
      source: JSON.stringify([{ id: "chat", name: "Chat" }]),
    }).toString();

    expect(url.pathname + url.search).toBe("/");
    expect(auditOptions(url)).toEqual({
      actor: "actor:one",
      redirectUrl: new URL(returnUrl),
      source: {
        key: '["https://app.example","chat"]',
        origin: "https://app.example",
        path: [{ id: "chat", name: "Chat" }],
      },
    });
  });

  it("ignores unsafe audit redirects and their source filter", () => {
    const url = new URL(
      "https://guard.graffiti.garden/?redirectUrl=javascript:alert(1)&source=[]",
    );
    expect(auditOptions(url)).toEqual({
      actor: undefined,
      redirectUrl: undefined,
      source: undefined,
    });
  });
});
