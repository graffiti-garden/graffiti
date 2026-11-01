import {
  GraffitiErrorForbidden,
  GraffitiErrorNotFound,
  GraffitiErrorTooLarge,
  type Graffiti,
  type GraffitiObject,
} from "@graffiti-garden/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../src/core/db.js";
import { MemoryRules } from "./memory-rules.js";
import { Guard, type GuardAnswer } from "../src/core/guard.js";
import { sourceFromContext, type Source } from "../src/core/source.js";
import { stampMedia } from "../src/core/media-provenance.js";

const origin = "https://example.com";
const actor = "actor:one";
const sessionA = { actor };
const sourceA = sourceFromContext(origin, { source: [{ id: "a", name: "A" }] });
const rootSource = sourceFromContext(origin, {});
const siteA = [origin, "a"];
const siteB = [origin, "b"];
const siteAKey = JSON.stringify(siteA);
const databases: MemoryRules[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((db) => db.destroy()));
});

function object(url: string, site?: string[], allowed: string[] | null = []) {
  return {
    url,
    actor,
    channels: ["channel"],
    allowed,
    value: {
      type: "Note",
      text: url,
      ...(site ? { "via site": { name: site.at(-1), id: JSON.stringify(site) } } : {}),
    },
  };
}

function harness(
  answer: (request: Request, canRemember: boolean) => GuardAnswer | Promise<GuardAnswer> = () => ({
    allow: true,
    remember: false,
  }),
) {
  const db = new MemoryRules();
  databases.push(db);
  const objects = new Map<string, ReturnType<typeof object>>();
  const media = new Map<string, {
    actor: string;
    data: Blob;
    allowed?: string[] | null;
  }>();
  const prompts: { request: Request; canRemember: boolean }[] = [];
  const graffiti = {
    sessionEvents: new EventTarget(),
    get: async (url: string) => {
      const found = objects.get(url);
      if (!found) throw new Error(`Missing object ${url}`);
      return found;
    },
    getMedia: async (url: string, accept: { maxBytes?: number }) => {
      const found = media.get(url);
      if (!found) throw new GraffitiErrorNotFound("Not media");
      if (accept.maxBytes !== undefined && found.data.size > accept.maxBytes) {
        throw new GraffitiErrorTooLarge("Media exceeds limit");
      }
      return found;
    },
  } as unknown as Graffiti;
  const guard = new Guard(graffiti, db, origin, async (request, canRemember) => {
    prompts.push({ request, canRemember });
    return answer(request, canRemember);
  });
  return { db, guard, objects, media, prompts };
}

async function receives(
  guard: Guard,
  args: Parameters<Guard["filterDiscovery"]>[1],
  object: GraffitiObject<{}>,
  source: Source,
  tombstone = false,
) {
  const stream = (async function* () {
    yield { object, ...(tombstone ? { tombstone: true as const } : {}) };
    return { cursor: "next" };
  })();
  for await (const _ of guard.filterDiscovery(stream, args, source)) return true;
  return false;
}

function mediaBlob(site: string[]) {
  return stampMedia(new Blob(["image"], { type: "image/png" }), sourceFromContext(site[0], {
    source: site.slice(1).map(id => ({ id, name: id })),
  }));
}

describe("site-scoped Guard permissions", () => {
  it("posts ordinary objects and media without a publishing prompt or grant", async () => {
    const { db, guard, prompts } = harness();

    const first = await guard.authorize("post", [
      { value: { type: "Note", text: "one" }, channels: ["one"] },
      sessionA,
    ], sourceA);
    await guard.authorize("post", [
      { value: { activity: "Like", target: "graffiti:other" }, channels: ["graffiti:other"] },
      sessionA,
    ], sourceA);
    await guard.authorize("postMedia", [
      { data: new Blob(["picture"], { type: "image/png" }), allowed: [] },
      sessionA,
    ], sourceA);

    expect(prompts).toEqual([]);
    expect(first!.args[0]).toMatchObject({
      value: { "via site": { name: "A", id: siteAKey } },
    });
    expect((await db.rulesSnapshot()).permissions).toEqual([]);
  });

  it("stamps parent and child posts with distinct IDs", async () => {
    const child = { actor, source: [...sourceA.path, { id: "chat", name: "Chat" }] };
    const childSource = sourceFromContext(origin, { source: child.source });
    const { guard, prompts } = harness();
    const parentPost = await guard.authorize("post", [{ value: {}, channels: [] }, sessionA], sourceA);
    const childPost = await guard.authorize("post", [{ value: {}, channels: [] }, child], childSource);
    expect(parentPost!.args[0]).toMatchObject({
      value: { "via site": { name: "A", id: siteAKey } },
    });
    expect(childPost!.args[0]).toMatchObject({
      value: { "via site": { name: "Chat", id: JSON.stringify([...siteA, "chat"]) } },
    });
    expect(prompts).toEqual([]);
  });

  it("uses the verified site when a session claims a different site", async () => {
    const { guard, objects, prompts } = harness();
    const sourceB = sourceFromContext(origin, { source: [{ id: "b", name: "B" }] });
    const claimedSession = { actor, source: sourceA.path };
    const post = await guard.authorize(
      "post",
      [{ value: {}, channels: [] }, claimedSession],
      sourceB,
    );
    expect(post!.args[0]).toMatchObject({
      value: { "via site": { name: "B", id: JSON.stringify(siteB) } },
    });
    expect(post!.args[1]).toEqual({ actor });

    objects.set("private", object("private", siteA));
    await guard.authorize("get", ["private", {}, claimedSession], sourceB);
    expect(prompts[0].request.source.key).toBe(JSON.stringify(siteB));
    expect(prompts[0].request.mode).toBe("read");
  });

  it("includes an optional document URL in the stamp without changing its ID", async () => {
    const { guard } = harness();
    const linkedSession = {
      actor,
      source: [{ id: "a", name: "A", url: "https://example.com/a" }],
    };
    const linkedSource = sourceFromContext(origin, { source: linkedSession.source });
    const post = await guard.authorize("post", [{ value: {}, channels: [] }, linkedSession], linkedSource);
    expect(post!.args[0]).toMatchObject({
      value: { "via site": { name: "A", id: siteAKey, url: "https://example.com/a" } },
    });
  });

  it("requires a separate exact confirmation for each consequential post", async () => {
    const { db, guard, prompts } = harness(() => ({ allow: true, remember: true }));
    await guard.authorize("post", [{ value: { type: "Note" }, channels: [] }, sessionA], sourceA);
    const confirmed = await guard.authorize("post", [
      {
        value: { action: "Trust", target: "actor:two", "confirm with guard": true },
        channels: ["profile"],
        allowed: [],
      },
      sessionA,
    ], sourceA);
    await guard.authorize("post", [
      { value: { action: "Trust", target: "actor:three", "confirm with guard": true }, channels: [] },
      sessionA,
    ], sourceA);

    expect(prompts.map(({ request }) => request.mode)).toEqual(["confirm", "confirm"]);
    expect(prompts.every(({ canRemember }) => !canRemember)).toBe(true);
    expect(confirmed!.args[0]).toMatchObject({
      value: {
        action: "Trust",
        "confirm with guard": true,
        "via site": { name: "A", id: siteAKey },
      },
      channels: ["profile"],
      allowed: [],
    });
    expect((await db.rulesSnapshot()).permissions).toEqual([]);
    await expect(
      guard.authorize("post", [
        { value: { action: "Trust", "via site": { name: "A", id: siteAKey } }, channels: [] },
        sessionA,
      ], sourceA),
    ).rejects.toBeInstanceOf(GraffitiErrorForbidden);
  });

  it("automatically reads same-site and unstamped private objects, but asks for another site", async () => {
    const { guard, objects, prompts } = harness();
    objects.set("same", object("same", siteA));
    objects.set("other", object("other", siteB));
    objects.set("unknown", object("unknown"));

    await guard.authorize("get", ["same", {}, sessionA], sourceA);
    await guard.authorize("get", ["unknown", {}, sessionA], sourceA);
    await guard.authorize("get", ["other", {}, sessionA], sourceA);

    expect(prompts).toHaveLength(1);
    expect(prompts[0].request).toMatchObject({
      mode: "read",
      originSite: { kind: "site", site: JSON.stringify(siteB), name: "b" },
    });
  });

  it("lets ancestors read child-created private data without granting sibling or child access", async () => {
    const { guard, objects, prompts } = harness();
    const childSite = [...siteA, "chat-1"];
    const child = { actor, source: [...sourceA.path, { id: "chat-1", name: "Chat 1" }] };
    const sibling = { actor, source: [...sourceA.path, { id: "chat-2", name: "Chat 2" }] };
    const childSource = sourceFromContext(origin, { source: child.source });
    const siblingSource = sourceFromContext(origin, { source: sibling.source });
    const root = { actor, source: [] };
    const childMessage = object("child-message", childSite);
    const parentMessage = object("parent-message", siteA);
    const foreignSite = ["https://other.example", "a", "chat-1"];
    objects.set(childMessage.url, childMessage);
    objects.set(parentMessage.url, parentMessage);
    objects.set("foreign-message", object("foreign-message", foreignSite));

    await guard.authorize("get", [childMessage.url, {}, sessionA], sourceA);
    await guard.authorize("get", [childMessage.url, {}, root], rootSource);
    await receives(guard, [["channel"], {}, sessionA], childMessage, sourceA);
    expect(await receives(guard, [["channel"], {}, sessionA], childMessage, sourceA, true)).toBe(true);
    expect(await receives(guard, [["channel"], {}, sibling], childMessage, siblingSource, true)).toBe(false);
    expect(prompts).toEqual([]);

    await guard.authorize("get", [childMessage.url, {}, sibling], siblingSource);
    await guard.authorize("get", [parentMessage.url, {}, child], childSource);
    await guard.authorize("get", ["foreign-message", {}, sessionA], sourceA);
    expect(prompts.map(({ request }) => request.originSite?.site)).toEqual([
      JSON.stringify(childSite),
      JSON.stringify(siteA),
      JSON.stringify(foreignSite),
    ]);
  });

  it("keeps an item-only private read for this Guard session, including its deletion notice", async () => {
    const { db, guard, objects, prompts } = harness();
    const first = object("first", siteB);
    const second = object("second", siteB);
    objects.set(first.url, first);
    objects.set(second.url, second);
    const stream = [["channel"], {}, sessionA] as const;

    expect(await receives(guard, stream, first, sourceA, true)).toBe(false);
    await guard.authorize("get", [first.url, {}, sessionA], sourceA);
    expect(await receives(guard, ["cursor", sessionA], first, sourceA, true)).toBe(true);
    await guard.authorize("get", [first.url, {}, sessionA], sourceA);
    await guard.authorize("get", [second.url, {}, sessionA], sourceA);
    expect(prompts).toHaveLength(2);
    expect((await db.rulesSnapshot()).permissions).toEqual([]);

    const refreshed = new Guard(
      { sessionEvents: new EventTarget(), get: async () => first } as unknown as Graffiti,
      db,
      origin,
      async () => ({ allow: false, remember: false }),
    );
    expect(await receives(refreshed, stream, first, sourceA, true)).toBe(false);
  });

  it("lets a site retry a private read after a denial without remember", async () => {
    let attempts = 0;
    const { db, guard, objects, prompts } = harness(() => ++attempts === 1
      ? { allow: false, remember: false }
      : { allow: true, remember: false });
    const item = object("first", siteB);
    objects.set(item.url, item);

    await expect(guard.authorize("get", [item.url, {}, sessionA], sourceA))
      .rejects.toBeInstanceOf(GraffitiErrorForbidden);
    expect(await receives(guard, [["channel"], {}, sessionA], item, sourceA, true)).toBe(false);
    await guard.authorize("get", [item.url, {}, sessionA], sourceA);
    await guard.authorize("get", [item.url, {}, sessionA], sourceA);

    expect(prompts).toHaveLength(2);
    expect((await db.rulesSnapshot()).permissions).toEqual([]);
  });

  it("lets a later remembered denial override an earlier item-only read", async () => {
    let decisions = 0;
    const { guard, objects, prompts } = harness(() => ++decisions === 1
      ? { allow: true, remember: false }
      : { allow: false, remember: true });
    objects.set("first", object("first", siteB));
    objects.set("second", object("second", siteB));

    await guard.authorize("get", ["first", {}, sessionA], sourceA);
    await expect(guard.authorize("get", ["second", {}, sessionA], sourceA))
      .rejects.toBeInstanceOf(GraffitiErrorForbidden);
    await expect(guard.authorize("get", ["first", {}, sessionA], sourceA))
      .rejects.toBeInstanceOf(GraffitiErrorForbidden);
    expect(prompts).toHaveLength(2);
  });

  it("does not retain a remembered read as an item grant after revocation", async () => {
    const { db, guard, objects, prompts } = harness(() => ({ allow: true, remember: true }));
    objects.set("first", object("first", siteB));

    await guard.authorize("get", ["first", {}, sessionA], sourceA);
    const { permissions } = await db.rulesSnapshot();
    expect(permissions).toHaveLength(1);
    await db.revoke(permissions[0].id);
    await guard.authorize("get", ["first", {}, sessionA], sourceA);
    expect(prompts).toHaveLength(2);
  });

  it("shares a remembered source-site read grant across objects and files", async () => {
    const { db, guard, objects, media, prompts } = harness(() => ({ allow: true, remember: true }));
    objects.set("first", object("first", siteB));
    objects.set("second", object("second", siteB));
    media.set("graffiti:file", { actor, data: mediaBlob(siteB), allowed: [] });

    await guard.authorize("get", ["first", {}, sessionA], sourceA);
    await guard.authorize("get", ["second", {}, sessionA], sourceA);
    await guard.authorize("getMedia", ["graffiti:file", {}, sessionA], sourceA);

    expect(prompts).toHaveLength(1);
    expect((await db.rulesSnapshot()).permissions).toMatchObject([
      { method: "get", match: { kind: "site", site: JSON.stringify(siteB) } },
    ]);
  });

  it("keeps remembered grants specific to their requester and actor", async () => {
    const { guard, objects, prompts } = harness(() => ({ allow: true, remember: true }));
    const foreign = object("foreign", ["https://notes.example", "b"]);
    objects.set(foreign.url, foreign);
    await guard.authorize("get", [foreign.url, {}, sessionA], sourceA);
    const child = sourceFromContext(origin, {
      source: [{ id: "a", name: "A" }, { id: "nested", name: "A" }],
    });
    // Provenance inheritance applies to data produced by descendants, not to
    // a grant that a different requester received for somebody else's data.
    await guard.authorize("get", [foreign.url, {}, sessionA], child);
    await guard.authorize("get", [foreign.url, {}, sessionA], rootSource);
    await guard.authorize("get", [foreign.url, {}, { actor: "actor:two" }], sourceA);
    await guard.authorize("get", [foreign.url, {}, sessionA], sourceA);
    expect(prompts).toHaveLength(4);
    expect(prompts.map(({ request }) => [request.source.key, request.actor])).toEqual([
      [sourceA.key, actor], [child.key, actor], [rootSource.key, actor], [sourceA.key, "actor:two"],
    ]);
  });

  it("applies the same private-read rule to data received from another actor", async () => {
    const { guard, objects, prompts } = harness();
    const received = { ...object("received", siteB), actor: "actor:sender", allowed: [actor] };
    objects.set(received.url, received);
    await guard.authorize("get", [received.url, {}, sessionA], sourceA);
    expect(prompts).toHaveLength(1);
    expect(prompts[0].request).toMatchObject({ actor, mode: "read", originSite: { kind: "site", site: JSON.stringify(siteB), name: "b" } });
    const producingSite = sourceFromContext(origin, { source: [{ id: "b", name: "B" }] });
    await guard.authorize("get", [received.url, {}, sessionA], producingSite);
    expect(prompts).toHaveLength(1);
  });

  it("allows unstamped private files without a prompt or stored grant", async () => {
    const { db, guard, media, prompts } = harness();
    media.set("graffiti:file", { actor, data: new Blob(["image"]), allowed: [] });
    await guard.authorize("getMedia", ["graffiti:file", {}, sessionA], sourceA);
    await guard.authorize("deleteMedia", ["graffiti:file", sessionA], sourceA);
    expect(prompts).toEqual([]);
    expect((await db.rulesSnapshot()).permissions).toEqual([]);
  });

  it("remembers an exact private media read, without also allowing deletion", async () => {
    const { db, guard, media, prompts } = harness();
    const file = "graffiti:file";
    media.set(file, { actor, data: mediaBlob(siteB), allowed: [] });
    await guard.authorize("getMedia", [file, {}, sessionA], sourceA);
    await guard.authorize("getMedia", [file, {}, sessionA], sourceA);
    expect(prompts).toHaveLength(1);
    expect((await db.rulesSnapshot()).permissions).toEqual([]);
    await guard.authorize("deleteMedia", [file, sessionA], sourceA);
    await guard.authorize("getMedia", [file, {}, { actor: "actor:two" }], sourceA);
    expect(prompts.map(({ request }) => request.mode)).toEqual(["read", "delete", "read"]);
  });

  it("handles ordinary objects without probing the media API", async () => {
    const db = new MemoryRules();
    databases.push(db);
    const file = object("graffiti:ordinary");
    const getMedia = vi.fn(() => { throw new Error("Unexpected media read"); });
    const graffiti = {
      sessionEvents: new EventTarget(),
      get: async () => file,
      getMedia,
    } as unknown as Graffiti;
    const guard = new Guard(graffiti, db, origin, async () => {
      throw new Error("Unstamped objects must not prompt.");
    });

    await guard.authorize("get", [file.url, {}, sessionA], sourceA);
    await guard.authorize("delete", [file.url, sessionA], sourceA);
    expect(getMedia).not.toHaveBeenCalled();
  });

  it("lets a site delete its own or unstamped objects, and scopes cross-site deletion separately", async () => {
    const { db, guard, objects, prompts } = harness(() => ({ allow: true, remember: true }));
    objects.set("own", object("own", siteA));
    objects.set("unknown", object("unknown"));
    objects.set("other-1", object("other-1", siteB));
    objects.set("other-2", object("other-2", siteB));

    await guard.authorize("delete", ["own", sessionA], sourceA);
    await guard.authorize("delete", ["unknown", sessionA], sourceA);
    await guard.authorize("delete", ["other-1", sessionA], sourceA);
    await guard.authorize("delete", ["other-2", sessionA], sourceA);

    expect(prompts).toHaveLength(1);
    expect(prompts[0].request).toMatchObject({ mode: "delete", originSite: { kind: "site", site: JSON.stringify(siteB), name: "b" } });
    expect((await db.rulesSnapshot()).permissions).toMatchObject([
      { method: "delete", match: { kind: "site", site: JSON.stringify(siteB), name: "b" } },
    ]);
  });

  it("uses the same delete rule for confirmed records", async () => {
    const { guard, objects, prompts } = harness(() => ({ allow: true, remember: true }));
    const confirmedOwn = object("confirmed-own", siteA);
    const confirmedOther = object("confirmed-other", siteB);
    confirmedOwn.value["confirm with guard"] = true;
    confirmedOther.value["confirm with guard"] = true;
    objects.set(confirmedOwn.url, confirmedOwn);
    objects.set(confirmedOther.url, confirmedOther);

    await guard.authorize("delete", [confirmedOwn.url, sessionA], sourceA);
    expect(prompts).toEqual([]);
    await guard.authorize("delete", [confirmedOther.url, sessionA], sourceA);
    expect(prompts).toHaveLength(1);
    await guard.authorize("delete", [confirmedOther.url, sessionA], sourceA);
    expect(prompts).toHaveLength(1);
  });

  it("lets ancestors delete child-created data without granting sibling or child deletion", async () => {
    const { guard, objects, prompts } = harness();
    const childSite = [...siteA, "chat-1"];
    const child = { actor, source: [...sourceA.path, { id: "chat-1", name: "Chat 1" }] };
    const sibling = { actor, source: [...sourceA.path, { id: "chat-2", name: "Chat 2" }] };
    const childSource = sourceFromContext(origin, { source: child.source });
    const siblingSource = sourceFromContext(origin, { source: sibling.source });
    objects.set("child-message", object("child-message", childSite));
    objects.set("parent-message", object("parent-message", siteA));

    await guard.authorize("delete", ["child-message", sessionA], sourceA);
    await guard.authorize("delete", ["child-message", { actor, source: [] }], rootSource);
    expect(prompts).toEqual([]);

    await guard.authorize("delete", ["child-message", sibling], siblingSource);
    await guard.authorize("delete", ["parent-message", child], childSource);
    expect(prompts.map(({ request }) => request.originSite?.site)).toEqual([
      JSON.stringify(childSite),
      JSON.stringify(siteA),
    ]);
  });

  it("does not let a remembered read grant delete cross-site data", async () => {
    const { guard, objects, prompts } = harness(() => ({ allow: true, remember: true }));
    objects.set("other", object("other", siteB));
    await guard.authorize("get", ["other", {}, sessionA], sourceA);
    await guard.authorize("delete", ["other", sessionA], sourceA);
    expect(prompts.map(({ request }) => request.mode)).toEqual(["read", "delete"]);
  });

  it("rejects blocked sites before fetching a media preview", async () => {
    const db = new MemoryRules();
    databases.push(db);
    const getMedia = vi.fn(async () => ({
      actor,
      allowed: [],
      data: new Blob(["private file"]),
    }));
    const graffiti = { sessionEvents: new EventTarget(), getMedia } as unknown as Graffiti;
    const guard = new Guard(graffiti, db, origin, async () => {
      throw new Error("A blocked site must not prompt.");
    });
    await db.blockSource({ key: siteAKey, origin, path: sourceA.path }, actor);

    await expect(guard.authorize("getMedia", ["graffiti:file", {}, sessionA], sourceA))
      .rejects.toBeInstanceOf(GraffitiErrorForbidden);
    expect(getMedia).not.toHaveBeenCalled();
  });
  it("confirms an app's permission post and uses ordinary provenance for its reads and deletes", async () => {
    const { guard, objects, prompts } = harness(() => ({ allow: true, remember: true }));
    const proposed = {
      channels: [`guard:permissions:site:${siteAKey}`, `guard:permissions:actor:${actor}`],
      allowed: [],
      value: {
        action: "Remember permission",
        "confirm with guard": true,
        published: Date.now(),
        site: { origin, path: sourceA.path },
        rule: {
          method: "get",
          decision: "deny",
          match: { kind: "site", site: JSON.stringify(siteB) },
        },
      },
    };
    const post = await guard.authorize("post", [proposed, sessionA], sourceA);
    const stamped = post!.args[0] as typeof proposed;
    const policy = { ...stamped, url: "graffiti:policy", actor };
    objects.set(policy.url, policy as never);
    expect(prompts.map(({ request }) => request.mode)).toEqual(["confirm"]);
    expect(prompts[0].canRemember).toBe(false);

    await guard.authorize("get", [policy.url, {}, sessionA], sourceA);
    await guard.authorize("delete", [policy.url, sessionA], sourceA);
    expect(prompts).toHaveLength(1);

    const otherSite = sourceFromContext("https://other.example", {});
    expect(await receives(guard, [["channel"], {}, sessionA], policy, otherSite, true)).toBe(false);
    await receives(guard, [["channel"], {}, sessionA], policy, otherSite);
    expect(await receives(guard, [["channel"], {}, sessionA], policy, otherSite, true)).toBe(true);
    await guard.authorize("delete", [policy.url, sessionA], otherSite);
    await guard.authorize("get", [policy.url, {}, sessionA], otherSite);
    await guard.authorize("delete", [policy.url, sessionA], otherSite);
    expect(prompts.map(({ request }) => request.mode)).toEqual(["confirm", "read", "delete"]);
    expect(prompts.slice(1).every(({ request }) => request.originSite?.site === siteAKey)).toBe(true);
  });

  it("does not reveal a cross-site private schema mismatch before read approval", async () => {
    const { guard, objects, prompts } = harness(() => false);
    objects.set("private", object("private", siteB));
    const mismatchingSchema = {
      properties: {
        value: {
          properties: { text: { const: "guessed text" } },
        },
      },
    } as const;

    await expect(guard.authorize("get", ["private", mismatchingSchema, sessionA], sourceA))
      .rejects.toBeInstanceOf(GraffitiErrorForbidden);
    expect(prompts).toHaveLength(1);
    expect(prompts[0].request.mode).toBe("read");
  });

  it("rechecks a queued private read after a remembered site decision", async () => {
    let release: (answer: GuardAnswer) => void = () => {};
    const firstAnswer = new Promise<GuardAnswer>((resolve) => { release = resolve; });
    let asked = 0;
    const { guard, objects, prompts } = harness(() => ++asked === 1
      ? firstAnswer
      : { allow: true, remember: true });
    objects.set("one", object("one", siteB));
    objects.set("two", object("two", siteB));
    const one = guard.authorize("get", ["one", {}, sessionA], sourceA);
    await vi.waitFor(() => expect(prompts).toHaveLength(1));
    const two = guard.authorize("get", ["two", {}, sessionA], sourceA);
    release({ allow: true, remember: true });
    await Promise.all([one, two]);
    expect(prompts).toHaveLength(1);
  });
});
