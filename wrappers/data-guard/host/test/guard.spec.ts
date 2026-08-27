import type { Graffiti } from "@graffiti-garden/api";
import { afterEach, describe, expect, it } from "vitest";
import { GuardDB } from "../src/core/db.js";
import { Guard } from "../src/core/guard.js";
import type { GraffitiMethod } from "../src/core/graffiti.js";

const databases: GuardDB[] = [];
afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.destroy()));
});

function setup(
  answer = { remember: true },
  mediaAllowed?: string[],
  objectAllowed?: string[],
) {
  const db = new GuardDB(`guard-test-${crypto.randomUUID()}`);
  databases.push(db);
  let prompts = 0;
  const object = {
    value: { type: "Note", content: "existing" },
    channels: ["chat"],
    url: "graffiti:existing",
    actor: "actor:one",
    ...(objectAllowed !== undefined ? { allowed: objectAllowed } : {}),
  };
  const graffiti = {
    sessionEvents: new EventTarget(),
    get: async (url: string) => ({ ...object, url }),
    getMedia: async () => ({
      data: new Blob(["media"], { type: "image/png" }),
      actor: "actor:one",
      ...(mediaAllowed !== undefined ? { allowed: mediaAllowed } : {}),
    }),
  } as unknown as Graffiti;
  const guard = new Guard(graffiti, db, "https://example.com", async () => {
    prompts += 1;
    return answer;
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
    await guard.succeed(first, { url: "graffiti:first" });

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

  it("automatically allows authenticated reads of public data", async () => {
    const { db, guard, prompts } = setup();

    const object = await guard.authorize("get", [
      "graffiti:public",
      {},
      session,
    ]);
    const media = await guard.authorize("getMedia", [
      "graffiti:public-media",
      {},
      session,
    ]);

    expect(prompts()).toBe(0);
    expect(object?.permission).toBeUndefined();
    expect(media?.permission).toBeUndefined();
    expect((await db.audit()).requests).toHaveLength(2);
  });

  it("treats activity as an object discriminator", async () => {
    const { guard, prompts } = setup();
    await guard.authorize("post", [
      {
        value: { activity: "Like", target: "graffiti:first" },
        channels: ["chat"],
      },
      session,
    ]);
    await guard.authorize("post", [
      {
        value: { activity: "Like", target: "graffiti:second" },
        channels: ["chat"],
      },
      session,
    ]);
    await guard.authorize("post", [
      {
        value: { activity: "Follow", target: "actor:two" },
        channels: ["chat"],
      },
      session,
    ]);

    expect(prompts()).toBe(2);
  });

  it("lets a remembered public operation apply to a recipient subset", async () => {
    const { guard, prompts } = setup();
    await guard.authorize("post", [
      { value: { type: "Note", content: "public" }, channels: ["chat"] },
      session,
    ]);
    await guard.authorize("post", [
      {
        value: { type: "Note", content: "private" },
        channels: ["chat"],
        allowed: ["actor:two"],
      },
      session,
    ]);

    expect(prompts()).toBe(1);
  });

  it("retains Allow Once access only for the exact approved read", async () => {
    const { db, guard, prompts } = setup({ remember: false }, [], []);

    const get = await guard.authorize("get", ["graffiti:first", {}, session]);
    const repeatedGet = await guard.authorize("get", [
      "graffiti:first",
      {},
      session,
    ]);
    await guard.authorize("get", ["graffiti:second", {}, session]);

    const query = await guard.authorize("discover", [
      ["chat"],
      { type: "object" },
      session,
    ]);
    const repeatedQuery = await guard.authorize("discover", [
      ["chat"],
      { type: "object" },
      session,
    ]);
    await guard.authorize("discover", [
      ["other"],
      { type: "object" },
      session,
    ]);

    const media = await guard.authorize("getMedia", [
      "graffiti:media",
      {},
      session,
    ]);
    const repeatedMedia = await guard.authorize("getMedia", [
      "graffiti:media",
      {},
      session,
    ]);

    expect(repeatedGet?.permission?.id).toBe(get?.permission?.id);
    expect(repeatedQuery?.permission?.id).toBe(query?.permission?.id);
    expect(repeatedMedia?.permission?.id).toBe(media?.permission?.id);
    expect(prompts()).toBe(5);
    expect((await db.audit()).permissions).toHaveLength(5);

    await guard.revoke(get!.permission!.id);
    await guard.authorize("get", ["graffiti:first", {}, session]);
    expect(prompts()).toBe(6);
  });

  it("implicitly permits reading data posted by the same app", async () => {
    const { db, guard, prompts } = setup({ remember: false }, [], []);

    const post = await guard.authorize("post", [
      { value: { type: "Note" }, channels: ["chat"] },
      session,
    ]);
    await guard.succeed(post, { url: "graffiti:posted" });
    const get = await guard.authorize("get", ["graffiti:posted", {}, session]);

    const postMedia = await guard.authorize("postMedia", [
      { data: new Blob(["private"]), allowed: [] },
      session,
    ]);
    await guard.succeed(postMedia, "graffiti:posted-media");
    const getMedia = await guard.authorize("getMedia", [
      "graffiti:posted-media",
      {},
      session,
    ]);

    expect(prompts()).toBe(2);
    expect(get?.permission?.id).toBeDefined();
    expect(getMedia?.permission?.id).toBeDefined();
    expect((await db.audit()).permissions).toHaveLength(2);
  });

  it("rejects an unknown authenticated Graffiti method", async () => {
    const { guard } = setup();
    await expect(
      guard.authorize(
        "futureMutation" as GraffitiMethod,
        [session] as never,
      ),
    ).rejects.toThrow("Unsupported authenticated Graffiti method");
  });
});
