import { describe, expect, it } from "vitest";
import type { Permission } from "../src/core/db.js";
import { latestDecision, matches } from "../src/core/permissions.js";

const source = {
  key: '["https://example.com"]',
  origin: "https://example.com",
  path: [],
};

function permission(
  match: Permission["match"],
  createdAt: number,
  decision: Permission["decision"] = "allow",
): Permission {
  return {
    id: `permission-${createdAt}`,
    source,
    actor: "actor:one",
    method: "get",
    match,
    decision,
    createdAt,
  };
}

describe("site permission matching", () => {
  it("does not treat a grant for one producing site as a grant for another", () => {
    const origin = '["https://producer.example","version-one"]';
    const grant = permission({ kind: "site", site: origin, name: "Page B" }, 1);
    expect(matches(grant, { kind: "site", site: origin })).toBe(true);
    expect(matches(grant, { kind: "site", site: origin, name: "Renamed" })).toBe(true);
    expect(matches(grant, {
      kind: "site",
      site: '["https://producer.example","version-two"]',
      name: "Page B",
    })).toBe(false);
  });

  it("takes the newest decision for the requested scope", () => {
    const site = { kind: "site", site: '["https://producer.example"]' } as const;
    const decisions = [
      permission(site, 1),
      permission({ kind: "site", site: '["https://other.example"]' }, 3, "deny"),
      permission(site, 2, "deny"),
    ];
    expect(latestDecision(decisions, site)).toBe("deny");
    expect(latestDecision(decisions, { kind: "site", site: '["https://other.example"]' })).toBe("deny");
    expect(latestDecision(decisions, { kind: "site", site: "unseen" })).toBeUndefined();
  });
});
