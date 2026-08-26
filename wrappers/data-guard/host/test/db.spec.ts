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
  const value = new GuardDB(`guard-test-${crypto.randomUUID()}`);
  databases.push(value);
  return value;
}

describe("GuardDB", () => {
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
});
