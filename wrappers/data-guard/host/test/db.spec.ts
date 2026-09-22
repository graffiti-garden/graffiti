import { afterEach, describe, expect, it } from "vitest";
import { GuardDB } from "../src/core/db.js";

const databases: GuardDB[] = [];
const source = {
  key: '["https://example.com","chat"]',
  origin: "https://example.com",
  path: [{ id: "chat", name: "Chat" }],
};

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.destroy()));
});

function database() {
  const value = new GuardDB();
  databases.push(value);
  return value;
}

describe("GuardDB", () => {
  it("stores and removes an identity-specific site block", async () => {
    const db = database();

    const block = await db.blockSource(source, "actor:one");
    expect(await db.isSourceBlocked(source, "actor:one")).toBe(true);
    expect(await db.isSourceBlocked(source, "actor:two")).toBe(false);
    expect((await db.rulesSnapshot()).siteBlocks).toEqual([block]);

    await db.unblockSource(source.key, "actor:one");
    expect(await db.isSourceBlocked(source, "actor:one")).toBe(false);
  });

  it("stores active permissions independently of transient requests", async () => {
    const db = database();
    const request = await db.request(source, "actor:one", "post", {
      kind: "object",
    });
    const permission = await db.grant(request, {
      source,
      actor: "actor:one",
      method: "post",
      match: { kind: "object", example: {} },
    });
    await db.finish(request);

    expect(await db.permissions(source, "actor:one", "post")).toEqual([
      permission,
    ]);
  });

  it("deletes revoked permissions", async () => {
    const db = database();
    const request = await db.request(source, "actor:one", "post", {});
    const permission = await db.grant(request, {
      source,
      actor: "actor:one",
      method: "post",
      match: { kind: "object", example: {} },
    });

    await db.revoke(permission.id);

    expect(await db.permissions(source, "actor:one", "post")).toEqual([]);
  });

  it("stores a remembered denial as a rule", async () => {
    const db = database();
    const request = await db.request(source, "actor:one", "post", {});
    const permission = await db.block(request, {
      source,
      actor: "actor:one",
      method: "post",
      match: { kind: "object", example: {} },
    });

    expect(permission.decision).toBe("deny");
    expect(await db.permissions(source, "actor:one", "post")).toEqual([
      permission,
    ]);
  });

  it("deduplicates concurrent exact permissions", async () => {
    const db = database();
    const permission = {
      source,
      actor: "actor:one",
      method: "get" as const,
      match: { kind: "object" as const, url: "graffiti:one" },
    };

    const [first, second] = await Promise.all([
      db.ensurePermission(permission),
      db.ensurePermission(permission),
    ]);

    expect(second.id).toBe(first.id);
    expect(await db.permissions(source, "actor:one", "get")).toHaveLength(1);
  });
});
