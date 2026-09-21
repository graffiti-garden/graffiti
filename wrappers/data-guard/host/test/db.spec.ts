import { afterEach, describe, expect, it } from "vitest";
import { openDB } from "idb";
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
  const value = new GuardDB(`guard-test-${crypto.randomUUID()}`);
  databases.push(value);
  return value;
}

describe("GuardDB", () => {
  it("forgets permissions created before decisions were stored", async () => {
    const name = `guard-test-${crypto.randomUUID()}`;
    const legacy = await openDB(name, 1, {
      upgrade(db) {
        const permissions = db.createObjectStore("permissions", {
          keyPath: "id",
        });
        permissions.createIndex("source", "source.key");
        const requests = db.createObjectStore("requests", {
          keyPath: "request.id",
        });
        requests.createIndex("undo", "request.undoOf");
      },
    });
    await legacy.add("permissions", {
      id: "legacy",
      source,
      actor: "actor:one",
      method: "post",
      match: { kind: "object", schema: {}, channels: [], allowed: "any" },
      createdAt: 0,
    });
    await legacy.add("requests", {
      request: {
        id: "history",
        source,
        actor: "actor:one",
        method: "post",
        subject: {},
        createdAt: 0,
      },
    });
    legacy.close();

    const db = new GuardDB(name);
    databases.push(db);

    const audit = await db.audit();
    expect(audit.permissions).toEqual([]);
    expect(audit.requests).toHaveLength(1);
    expect(audit.siteBlocks).toEqual([]);
  });

  it("stores and removes a site-wide block", async () => {
    const db = database();

    const block = await db.blockSource(source);
    expect(await db.isSourceBlocked(source)).toBe(true);
    expect((await db.audit()).siteBlocks).toEqual([block]);

    await db.unblockSource(source.key);
    expect(await db.isSourceBlocked(source)).toBe(false);
  });

  it("stores active permissions separately from request results", async () => {
    const db = database();
    const request = await db.request(source, "actor:one", "post", {
      kind: "object",
    });
    const permission = await db.grant(request, {
      source,
      actor: "actor:one",
      method: "post",
      match: { kind: "object", schema: {}, channels: [], allowed: "any" },
    });
    await db.finish(request, { ok: true, value: { url: "graffiti:one" } });

    expect(await db.permissions(source, "actor:one", "post")).toEqual([
      permission,
    ]);
    const audit = await db.audit();
    expect(audit.requests[0].request).toEqual(request);
    expect(audit.requests[0].result).toMatchObject({
      authorization: {
        allowed: true,
        permission: { id: permission.id, created: true },
      },
      execution: { ok: true, value: { url: "graffiti:one" } },
    });
  });

  it("deletes revoked permissions", async () => {
    const db = database();
    const grant = await db.request(source, "actor:one", "post", {});
    const permission = await db.grant(grant, {
      source,
      actor: "actor:one",
      method: "post",
      match: { kind: "object", schema: {}, channels: [], allowed: "any" },
    });
    await db.revoke(permission.id);

    expect(await db.permissions(source, "actor:one", "post")).toEqual([]);
  });

  it("stores a remembered denial with the denied request", async () => {
    const db = database();
    const request = await db.request(source, "actor:one", "post", {});
    const permission = await db.block(request, {
      source,
      actor: "actor:one",
      method: "post",
      match: { kind: "object", schema: {}, channels: [], allowed: "any" },
    });

    expect(permission.decision).toBe("deny");
    expect((await db.audit()).requests[0].result?.authorization).toEqual({
      allowed: false,
      at: expect.any(Number),
      permission: { id: permission.id, created: true },
    });
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

  it("clears history without clearing active permissions", async () => {
    const db = database();
    const request = await db.request(source, "actor:one", "logout", {});
    await db.grant(request, {
      source,
      actor: "actor:one",
      method: "logout",
      match: { kind: "logout" },
    });
    await db.clearHistory();

    expect((await db.audit()).requests).toEqual([]);
    expect(await db.permissions(source, "actor:one", "logout")).toHaveLength(1);
  });

  it("clears site blocks with the rest of the guard data", async () => {
    const db = database();
    const request = await db.request(source, "actor:one", "logout", {});
    await db.grant(request, {
      source,
      actor: "actor:one",
      method: "logout",
      match: { kind: "logout" },
    });
    await db.blockSource(source);

    await db.clearEverything();

    expect(await db.audit()).toEqual({
      permissions: [],
      requests: [],
      siteBlocks: [],
    });
  });

  it("does not resurrect an in-flight request after history is cleared", async () => {
    const db = database();
    const request = await db.request(source, "actor:one", "post", {});
    await db.allow(request);
    await db.clearHistory();

    await expect(
      db.finish(request, { ok: true, value: { url: "graffiti:one" } }),
    ).resolves.toBeUndefined();
    expect((await db.audit()).requests).toEqual([]);
  });

  it("atomically permits only one recovery per request", async () => {
    const db = database();
    const original = await db.request(source, "actor:one", "post", {});

    const attempts = await Promise.allSettled([
      db.recovery(source, "actor:one", "delete", {}, original.id),
      db.recovery(source, "actor:one", "delete", {}, original.id),
    ]);

    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(
      (await db.audit()).requests.filter(
        ({ request }) => request.undoOf === original.id,
      ),
    ).toHaveLength(1);
  });
});
