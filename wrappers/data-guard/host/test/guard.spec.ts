import type { Graffiti } from "@graffiti-garden/api";
import { afterEach, describe, expect, it } from "vitest";
import { GuardDB } from "../src/core/db.js";
import { Guard } from "../src/core/guard.js";

const databases: GuardDB[] = [];
afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.destroy()));
});

function setup() {
  const db = new GuardDB(`guard-test-${crypto.randomUUID()}`);
  databases.push(db);
  let prompts = 0;
  const object = {
    value: { type: "Note", content: "existing" },
    channels: ["chat"],
    url: "graffiti:existing",
    actor: "actor:one",
  };
  const graffiti = {
    sessionEvents: new EventTarget(),
    get: async () => object,
    getMedia: async () => ({
      data: new Blob(["media"], { type: "image/png" }),
      actor: "actor:one",
    }),
  } as unknown as Graffiti;
  const guard = new Guard(graffiti, db, "https://example.com", async () => {
    prompts += 1;
    return { remember: true };
  });
  return { db, guard, prompts: () => prompts };
}

const session = {
  actor: "actor:one",
  source: [{ id: "chat", name: "Chat" }],
};

describe("Guard", () => {
  it("reuses a permission only for the same method, actor, and source", async () => {
    const { guard, prompts } = setup();
    const first = await guard.authorize("post", [
      {
        value: { type: "Note", content: "first" },
        channels: ["chat"],
      },
      session,
    ]);
    await guard.succeed(first, "post", { url: "graffiti:first" });

    const second = await guard.authorize("post", [
      {
        value: { type: "Note", content: "second" },
        channels: ["chat"],
      },
      session,
    ]);
    expect(second?.permission?.id).toBe(first?.permission?.id);
    expect(prompts()).toBe(1);

    await guard.authorize("delete", ["graffiti:existing", session]);
    await guard.authorize("post", [
      {
        value: { type: "Note", content: "third" },
        channels: ["chat"],
      },
      { ...session, actor: "actor:two" },
    ]);
    expect(prompts()).toBe(3);
  });

  it("records authorization separately from execution failure", async () => {
    const { db, guard } = setup();
    const request = await guard.authorize("logout", [session]);
    await guard.fail(request, new Error("network unavailable"));
    const entry = (await db.audit()).requests[0];

    expect(entry.result?.authorization.allowed).toBe(true);
    expect(entry.result?.execution).toMatchObject({
      ok: false,
      error: "network unavailable",
    });
  });

  it("records a denial without inventing an execution result", async () => {
    const { db } = setup();
    const graffiti = {
      sessionEvents: new EventTarget(),
    } as unknown as Graffiti;
    const guard = new Guard(
      graffiti,
      db,
      "https://example.com",
      async () => false,
    );

    await expect(guard.authorize("logout", [session])).rejects.toThrow(
      "denied",
    );
    const entry = (await db.audit()).requests[0];
    expect(entry.result?.authorization.allowed).toBe(false);
    expect(entry.result?.execution).toBeUndefined();
  });

  it("treats a discovery cursor as authority to continue", async () => {
    const { db, guard, prompts } = setup();
    const continuation = await guard.authorize("continueDiscover", [
      "cursor-one",
      session,
    ]);

    expect(continuation).toBeUndefined();
    expect(prompts()).toBe(0);
    expect((await db.audit()).requests).toEqual([]);
  });

  it("does not guard sessionless public reads", async () => {
    const { guard, prompts } = setup();
    expect(await guard.authorize("get", ["graffiti:public", {}])).toBeUndefined();
    expect(await guard.authorize("discover", [["chat"], {}])).toBeUndefined();
    expect(prompts()).toBe(0);
  });
});
