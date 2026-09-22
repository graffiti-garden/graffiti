import type { Graffiti } from "@graffiti-garden/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuardDB } from "../src/core/db.js";
import {
  Guard,
  type GuardAnswer,
  type GuardPromptContext,
  type GuardQueueStatus,
} from "../src/core/guard.js";
import type { GraffitiMethod } from "../src/core/graffiti.js";

const databases: GuardDB[] = [];
afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.destroy()));
});

function setup(
  answer: GuardAnswer = { allow: true, remember: true },
  mediaAllowed?: string[] | null,
  objectAllowed?: string[] | null,
) {
  const db = new GuardDB();
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
    const db = new GuardDB();
    databases.push(db);
    let prompts = 0;
    let queue: GuardQueueStatus | undefined;
    let answerFirst: (answer: GuardAnswer) => void = () => {};
    const firstAnswer = new Promise<GuardAnswer>(
      (resolve) => (answerFirst = resolve),
    );
    const guard = new Guard(
      { sessionEvents: new EventTarget() } as Graffiti,
      db,
      "https://example.com",
      async (_request, _canRemember, _preview, context) => {
        prompts += 1;
        queue = context?.queue;
        return prompts === 1
          ? firstAnswer
          : { allow: true, remember: true };
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
    expect(queue?.pending).toBe(2);

    answerFirst({ allow: true, remember: true });
    const [firstHandle, secondHandle] = await Promise.all([first, second]);
    expect(secondHandle?.permission?.id).toBe(firstHandle?.permission?.id);
    expect(prompts).toBe(1);
    expect(queue?.pending).toBe(0);
  });

  it("does not count queued requests that cannot prompt", async () => {
    const db = new GuardDB();
    databases.push(db);
    await db.ensurePermission({
      source: {
        key: JSON.stringify(["https://example.com", "chat"]),
        origin: "https://example.com",
        path: session.source,
      },
      actor: session.actor,
      method: "logout",
      match: { kind: "logout" },
    });
    let queue: GuardQueueStatus | undefined;
    let answerPrompt: (answer: GuardAnswer) => void = () => {};
    const promptAnswer = new Promise<GuardAnswer>(
      (resolve) => (answerPrompt = resolve),
    );
    const guard = new Guard(
      {
        sessionEvents: new EventTarget(),
        get: async (url: string) => ({
          value: { type: "Note", content: "public" },
          channels: ["chat"],
          url,
          actor: "actor:one",
        }),
      } as unknown as Graffiti,
      db,
      "https://example.com",
      async (_request, _canRemember, _preview, context) => {
        queue = context?.queue;
        return promptAnswer;
      },
    );

    const post = guard.authorize("post", [
      { value: { type: "Note", content: "private" }, channels: ["chat"] },
      session,
    ]);
    await vi.waitFor(() => expect(queue?.pending).toBe(1));

    const get = guard.authorize("get", ["graffiti:public", {}, session]);
    const logout = guard.authorize("logout", [session]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(queue?.pending).toBe(1);

    answerPrompt({ allow: true, remember: false });
    await Promise.all([post, get, logout]);
    expect(queue?.pending).toBe(0);
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

  it("reuses a remembered denial for similar requests", async () => {
    const { db, guard, prompts } = setup({ allow: false, remember: true });
    const post = (content: string) =>
      guard.authorize("post", [
        {
          value: { type: "Note", content },
          channels: ["chat"],
        },
        session,
      ]);

    await expect(post("first")).rejects.toThrow("denied");
    await expect(post("second")).rejects.toThrow("denied");

    expect(prompts()).toBe(1);
    const permissions = (await db.rulesSnapshot()).permissions;
    expect(permissions).toHaveLength(1);
    expect(permissions[0].decision).toBe("deny");
  });

  it("does not remember an unchecked post denial or a cancellation", async () => {
    for (const answer of [
      { allow: false, remember: false } as const,
      false as const,
    ]) {
      const { db, guard, prompts } = setup(answer);
      const args = [
        { value: { type: "Note" }, channels: ["chat"] },
        session,
      ] as const;

      await expect(guard.authorize("post", args)).rejects.toThrow("denied");
      await expect(guard.authorize("post", args)).rejects.toThrow("denied");

      expect(prompts()).toBe(2);
      expect((await db.rulesSnapshot()).permissions).toEqual([]);
    }
  });

  it("retains an unchecked denial only for the exact private read", async () => {
    const { db, guard, prompts } = setup(
      { allow: false, remember: false },
      [],
      [],
    );
    const denyObject = (url: string) =>
      guard.authorize("get", [url, {}, session]);
    const denyMedia = (url: string) =>
      guard.authorize("getMedia", [url, {}, session]);

    await expect(denyObject("graffiti:first")).rejects.toThrow("denied");
    await expect(denyObject("graffiti:first")).rejects.toThrow("denied");
    await expect(denyObject("graffiti:second")).rejects.toThrow("denied");
    await expect(denyMedia("graffiti:media")).rejects.toThrow("denied");
    await expect(denyMedia("graffiti:media")).rejects.toThrow("denied");

    expect(prompts()).toBe(3);
    const permissions = (await db.rulesSnapshot()).permissions;
    expect(permissions).toHaveLength(3);
    expect(permissions.every(({ decision }) => decision === "deny")).toBe(true);
    expect(permissions.map(({ match }) => match)).toEqual(
      expect.arrayContaining([
        { kind: "object", url: "graffiti:first" },
        { kind: "object", url: "graffiti:second" },
        { kind: "media", url: "graffiti:media" },
      ]),
    );
  });

  it("does not remember a cancelled private read", async () => {
    const { db, guard, prompts } = setup(false, [], []);

    await expect(
      guard.authorize("get", ["graffiti:private", {}, session]),
    ).rejects.toThrow("denied");
    await expect(
      guard.authorize("get", ["graffiti:private", {}, session]),
    ).rejects.toThrow("denied");

    expect(prompts()).toBe(2);
    expect((await db.rulesSnapshot()).permissions).toEqual([]);
  });

  it("blocks every guarded request from a site for the same identity", async () => {
    const { db, guard, prompts } = setup({ blockSite: true }, [], []);

    await expect(
      guard.authorize("post", [
        { value: { type: "Note" }, channels: ["chat"] },
        session,
      ]),
    ).rejects.toThrow("blocked all requests");
    await expect(
      guard.authorize("getMedia", [
        "graffiti:media",
        {},
        { ...session, actor: "actor:two" },
      ]),
    ).rejects.toThrow("blocked all requests");

    expect(prompts()).toBe(2);
    const rules = await db.rulesSnapshot();
    expect(rules.siteBlocks).toHaveLength(2);
    expect(rules.permissions).toEqual([]);
  });

  it("does not accept an open prompt after another guard blocks the site", async () => {
    const db = new GuardDB();
    databases.push(db);
    const graffiti = { sessionEvents: new EventTarget() } as Graffiti;
    let answerOpenPrompt: (answer: GuardAnswer) => void = () => {};
    let openPrompted = false;
    const openAnswer = new Promise<GuardAnswer>(
      (resolve) => (answerOpenPrompt = resolve),
    );
    const openGuard = new Guard(
      graffiti,
      db,
      "https://example.com",
      async () => {
        openPrompted = true;
        return openAnswer;
      },
    );
    const blockingGuard = new Guard(
      graffiti,
      db,
      "https://example.com",
      async () => ({ blockSite: true }),
    );
    const post = (guard: Guard, content: string) =>
      guard.authorize("post", [
        { value: { type: "Note", content }, channels: ["chat"] },
        session,
      ]);

    const openRequest = post(openGuard, "open");
    await vi.waitFor(() => expect(openPrompted).toBe(true));
    await expect(post(blockingGuard, "block")).rejects.toThrow(
      "blocked all requests",
    );
    answerOpenPrompt({ allow: true, remember: true });

    await expect(openRequest).rejects.toThrow("blocked all requests");
    expect((await db.rulesSnapshot()).permissions).toEqual([]);
  });

  it("does not authorize discovery queries or cursors", async () => {
    const { guard, prompts } = setup();
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
  });

  it("does not guard sessionless public reads", async () => {
    const { guard, prompts } = setup();
    expect(await guard.authorize("get", ["graffiti:public", {}])).toBeUndefined();
    expect(await guard.authorize("discover", [["chat"], {}])).toBeUndefined();
    expect(prompts()).toBe(0);
  });

  it("automatically allows authenticated reads of public data", async () => {
    const { guard, prompts } = setup();

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
  });

  it("also treats a null allowed list as public", async () => {
    const { db, guard, prompts } = setup(
      { allow: true, remember: true },
      null,
      null,
    );

    await guard.authorize("get", ["graffiti:public", {}, session]);
    await guard.authorize("getMedia", ["graffiti:public-media", {}, session]);

    expect(prompts()).toBe(0);
    expect((await db.rulesSnapshot()).permissions).toEqual([]);
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

  it("stores examples for remembered broad permissions", async () => {
    const { guard } = setup({ allow: true, remember: true }, [], []);

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
      example: {
        type: "Note",
        content: "existing",
      },
    });
    expect(media?.permission?.match).toMatchObject({
      kind: "media",
      example: {
        type: "image/png",
        size: 5,
      },
    });
  });

  it("retains an unremembered allow only for the exact approved read", async () => {
    const { db, guard, prompts } = setup(
      { allow: true, remember: false },
      [],
      [],
    );

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
    expect((await db.rulesSnapshot()).permissions).toHaveLength(3);

    await guard.revoke(get!.permission!.id);
    await guard.authorize("get", ["graffiti:first", {}, session]);
    expect(prompts()).toBe(4);
  });

  it("implicitly permits reading data posted by the same app", async () => {
    const { db, guard, prompts } = setup(
      { allow: true, remember: false },
      [],
      [],
    );

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
    expect((await db.rulesSnapshot()).permissions).toHaveLength(2);
  });

  it("does not store implicit read permissions for public writes", async () => {
    const { db, guard } = setup({ allow: true, remember: false });

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

    expect((await db.rulesSnapshot()).permissions).toEqual([]);
  });

  it("authorizes private discovery results as exact get requests", async () => {
    const { db, guard, prompts } = setup(
      { allow: true, remember: false },
      [],
      [],
    );
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
    expect((await db.rulesSnapshot()).permissions).toHaveLength(1);
  });

  it("marks private discovery prompts as part of a result stream", async () => {
    const db = new GuardDB();
    databases.push(db);
    let promptContext: GuardPromptContext | undefined;
    const guard = new Guard(
      { sessionEvents: new EventTarget() } as Graffiti,
      db,
      "https://example.com",
      async (_request, _canRemember, _preview, context) => {
        promptContext = context;
        return { allow: true, remember: false };
      },
    );

    await guard.authorizeDiscovered([["chat"], {}, session], {
      url: "graffiti:private",
      value: {},
      channels: ["chat"],
      allowed: [],
      actor: "actor:one",
    });

    expect(promptContext?.privateResult).toBe(1);
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
    expect(await db.rulesSnapshot()).toEqual({
      permissions: [],
      siteBlocks: [],
    });
  });

  it("uses broad get permissions for later private discovery results", async () => {
    const { db, guard, prompts } = setup(
      { allow: true, remember: true },
      [],
      [],
    );
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
    expect((await db.rulesSnapshot()).permissions).toHaveLength(3);
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
    expect(await db.rulesSnapshot()).toEqual({
      permissions: [],
      siteBlocks: [],
    });
  });

  it("does not remember a cancelled private discovery result", async () => {
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
    expect((await db.rulesSnapshot()).permissions).toEqual([]);
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
