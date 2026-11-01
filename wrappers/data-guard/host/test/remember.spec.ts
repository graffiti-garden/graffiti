import { describe, expect, it } from "vitest";
import type { Request } from "../src/core/db.js";
import { originSiteLabel, rememberDecisionLabel } from "../src/ui/remember.js";

const source = { key: "https://example.com", origin: "https://example.com", path: [] };
const originSite = { kind: "site", site: JSON.stringify(["https://notes.example", "page-version"]), name: "Notes" } as const;

function request(
  method: Request["method"],
  mode: "confirm" | "read" | "delete" | "logout",
  overrides: object = {},
): Request {
  return {
    source,
    actor: "actor",
    method,
    subject: {},
    mode,
    ...overrides,
  } as Request;
}

describe("rememberDecisionLabel", () => {
  it("names the source site and covers both objects and files", () => {
    expect(
      rememberDecisionLabel(request("get", "read", { originSite })),
    ).toBe(
      "Remember this decision for all private data created on notes.example › Notes.",
    );
    expect(
      rememberDecisionLabel(request("deleteMedia", "delete", { originSite })),
    ).toBe(
      "Remember this decision for deletion of all objects and files created on notes.example › Notes, now and later.",
    );
  });

  it("does not offer a remembered scope for exact confirmation or unknown origins", () => {
    expect(rememberDecisionLabel(request("post", "confirm"))).toBe("");
    expect(rememberDecisionLabel(request("get", "read"))).toBe("");
    expect(rememberDecisionLabel(request("delete", "delete"))).toBe("");
  });

  it("does not remember logout choices", () => {
    expect(rememberDecisionLabel(request("logout", "logout"))).toBe("");
  });
});

describe("originSiteLabel", () => {
  it("uses the saved name alongside the origin", () => {
    expect(originSiteLabel({ ...originSite, name: "Page B" })).toBe("notes.example › Page B");
    expect(rememberDecisionLabel(request("get", "read", {
      originSite: { ...originSite, name: "Page B" },
    }))).toBe("Remember this decision for all private data created on notes.example › Page B.");
  });

  it("keeps IDs out of labels when old rules have no name", () => {
    expect(originSiteLabel({ ...originSite, name: undefined })).toBe("notes.example › Unnamed site");
    expect(originSiteLabel({ kind: "site", site: JSON.stringify(["https://notes.example", "a".repeat(64)]) }))
      .toBe("notes.example › Unnamed site");
    expect(originSiteLabel({ kind: "site", site: "malformed-id" })).toBe("Unknown site");
  });
});
