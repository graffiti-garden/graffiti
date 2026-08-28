import { describe, expect, it } from "vitest";
import { auditOptions } from "../src/bootstrap/audit.js";
import { sourceFromContext } from "../src/core/source.js";

describe("guard sources", () => {
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
