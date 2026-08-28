import type { Graffiti } from "@graffiti-garden/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuardDB } from "../src/core/db.js";
import { Guard } from "../src/core/guard.js";
import type { GraffitiMethod } from "../src/core/graffiti.js";

const databases: GuardDB[] = [];
afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.destroy()));
});

function setup(
  answer:
    | false
    | { remember: boolean } = { remember: true },
  mediaAllowed?: string[] | null,
  objectAllowed?: string[] | null,
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
  it("rechecks permissions before showing a queued prompt", async () => {
    const db = new GuardDB(`guard-test-${crypto.randomUUID()}`);
    databases.push(db);
    let prompts = 0;
    let answerFirst: (answer: { remember: boolean }) => void = () => {};
    const firstAnswer = new Promise<{ remember: boolean }>(
      (resolve) => (answerFirst = resolve),
    );
    const guard = new Guard(
      { sessionEvents: new EventTarget() } as Graffiti,
      db,
      "https://example.com",
      async () => {
        prompts += 1;
        return prompts === 1 ? firstAnswer : { remember: true };
      },
    );
    const post = (content: string) =>
      guard.authorize("post", [
        { value: { type: "Note", content }, channels: ["chat"] },
        session,
      ]);

    const first = post("first");
    await vi.waitFor(() => expect(prompts).toBe(1));
    const second = post("second");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(prompts).toBe(1);

    answerFirst({ remember: true });
    const [firstHandle, secondHandle] = await Promise.all([first, second]);
    expect(secondHandle?.permission?.id).toBe(firstHandle?.permission?.id);
    expect(prompts).toBe(1);
  });

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

  it("does not authorize or audit discovery queries or cursors", async () => {
    const { db, guard, prompts } = setup();
    const discovery = await guard.authorize("discover", [
      ["chat"],
      {},
      session,
    ]);
    const continuation = await guard.authorize("continueDiscover", [
      "cursor-one",
      session,
    ]);

    expect(discovery).toBeUndefined();
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

  it("also treats a null allowed list as public", async () => {
    const { db, guard, prompts } = setup({ remember: true }, null, null);

    await guard.authorize("get", ["graffiti:public", {}, session]);
    await guard.authorize("getMedia", ["graffiti:public-media", {}, session]);

    expect(prompts()).toBe(0);
    expect((await db.audit()).permissions).toEqual([]);
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

  it("defaults remembered channel and recipient scopes to any", async () => {
    const { guard } = setup({ remember: true }, [], []);

    const object = await guard.authorize("get", [
      "graffiti:private",
      {},
      session,
    ]);
    const media = await guard.authorize("getMedia", [
      "graffiti:private-media",
      {},
      session,
    ]);

    expect(object?.permission?.match).toMatchObject({
      kind: "object",
      channels: "any",
      allowed: "any",
    });
    expect(media?.permission?.match).toMatchObject({
      kind: "media",
      allowed: "any",
    });
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
    expect(repeatedMedia?.permission?.id).toBe(media?.permission?.id);
    expect(prompts()).toBe(3);
    expect((await db.audit()).permissions).toHaveLength(3);

    await guard.revoke(get!.permission!.id);
    await guard.authorize("get", ["graffiti:first", {}, session]);
    expect(prompts()).toBe(4);
  });

  it("implicitly permits reading data posted by the same app", async () => {
    const { db, guard, prompts } = setup({ remember: false }, [], []);

    const post = await guard.authorize("post", [
      { value: { type: "Note" }, channels: ["chat"], allowed: [] },
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

  it("does not store implicit read permissions for public writes", async () => {
    const { db, guard } = setup({ remember: false });

    const post = await guard.authorize("post", [
      { value: { type: "Note" }, channels: ["chat"] },
      session,
    ]);
    await guard.succeed(post, { url: "graffiti:public-post" });
    const postMedia = await guard.authorize("postMedia", [
      { data: new Blob(["public"]) },
      session,
    ]);
    await guard.succeed(postMedia, "graffiti:public-media");

    expect((await db.audit()).permissions).toEqual([]);
  });

  it("authorizes private discovery results as exact get requests", async () => {
    const { db, guard, prompts } = setup({ remember: false }, [], []);
    const args = [["chat"], {}, session];
    const object = {
      url: "graffiti:discovered",
      value: { type: "Note" },
      channels: ["chat"],
      allowed: [],
      actor: "actor:one",
    };

    const first = await guard.authorizeDiscovered(args, object);
    await guard.succeed(first, object);
    const second = await guard.authorizeDiscovered(["cursor", session], object);
    await guard.succeed(second, object);

    expect(prompts()).toBe(1);
    expect(second?.permission?.id).toBe(first?.permission?.id);
    expect((await db.audit()).permissions).toHaveLength(1);
    const history = (await db.audit()).requests;
    expect(history).toHaveLength(2);
    expect(history.every(({ request }) => request.method === "get")).toBe(true);
    expect(history.every(({ result }) => result?.execution?.ok)).toBe(true);
  });

  it("does not record or store public discovery results", async () => {
    const { db, guard, prompts } = setup();
    const base = {
      value: {},
      channels: ["chat"],
      actor: "actor:one",
    };

    expect(await guard.authorizeDiscovered([["chat"], {}, session], {
      ...base,
      url: "graffiti:undefined",
    })).toBeUndefined();
    expect(await guard.authorizeDiscovered([["chat"], {}, session], {
      ...base,
      url: "graffiti:null",
      allowed: null,
    })).toBeUndefined();

    expect(prompts()).toBe(0);
    expect(await db.audit()).toEqual({ permissions: [], requests: [] });
  });

  it("uses broad get permissions for later private discovery results", async () => {
    const { db, guard, prompts } = setup({ remember: true }, [], []);
    const args = [["chat"], {}, session];
    const object = (url: string, content: string) => ({
      url,
      value: { type: "Note", content },
      channels: ["chat"],
      allowed: [],
      actor: "actor:one",
    });

    const first = await guard.authorizeDiscovered(
      args,
      object("graffiti:first", "first"),
    );
    await guard.succeed(first, object("graffiti:first", "first"));
    const second = await guard.authorizeDiscovered(
      args,
      object("graffiti:second", "second"),
    );
    await guard.succeed(second, object("graffiti:second", "second"));

    expect(prompts()).toBe(1);
    expect(second?.permission?.id).toBe(first?.permission?.id);
    // One broad grant plus an exact grant for each disclosed object.
    expect((await db.audit()).permissions).toHaveLength(3);
  });

  it("rejects a private sessionless discovery result", async () => {
    const { db, guard, prompts } = setup();

    await expect(
      guard.authorizeDiscovered([["chat"], {}], {
        url: "graffiti:private",
        value: {},
        channels: ["chat"],
        allowed: [],
        actor: "actor:one",
      }),
    ).rejects.toThrow("authenticated session");

    expect(prompts()).toBe(0);
    expect(await db.audit()).toEqual({ permissions: [], requests: [] });
  });

  it("records a denied private discovery result as a get request", async () => {
    const { db, guard, prompts } = setup(false, [], []);

    await expect(
      guard.authorizeDiscovered([["chat"], {}, session], {
        url: "graffiti:private",
        value: {},
        channels: ["chat"],
        allowed: [],
        actor: "actor:one",
      }),
    ).rejects.toBeInstanceOf(Error);

    expect(prompts()).toBe(1);
    const [entry] = (await db.audit()).requests;
    expect(entry.request.method).toBe("get");
    expect(entry.result?.authorization.allowed).toBe(false);
    expect(entry.result?.execution).toBeUndefined();
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
