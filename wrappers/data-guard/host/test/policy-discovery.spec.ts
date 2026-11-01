import type { Graffiti, GraffitiObjectBase } from "@graffiti-garden/api";
import { createRenderer, h, ssrContextKey } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import { GraffitiSynchronize } from "../../../synchronize/src/index.ts";
import { GraffitiRuleStore } from "../src/core/rules.js";
import { sourceFromContext } from "../src/core/source.js";
import RuleStoreScope from "../src/ui/RuleStoreScope.vue";
import { Guard } from "../src/core/guard.js";
import { GuardedGraffiti } from "../src/core/graffiti.js";

const mock = vi.hoisted(() => ({ graffiti: undefined as unknown }));
vi.mock("../../../../plugins/vue/src/globals.ts", () => ({
  useGraffitiSynchronize: () => mock.graffiti,
}));
vi.mock("@graffiti-garden/wrapper-vue", async () => ({
  useGraffitiDiscover: (await import(
    "../../../../plugins/vue/src/composables/discover.ts"
  )).useGraffitiDiscover,
}));

// RuleStoreScope has no visible UI; exercise its real setup without a DOM.
const renderer = createRenderer<object, object>({
  insert() {}, remove() {}, patchProp() {}, setText() {}, setElementText() {},
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  parentNode: () => null, nextSibling: () => null,
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("uses one policy discovery per site and actor, and writes no policy for ordinary posts", async () => {
  const values = new Map<string, GraffitiObjectBase>();
  const discover = vi.fn(async function* () { return { cursor: "cursor" }; });
  const post = vi.fn(async (input: object, session: { actor: string }) => {
    const object = { ...input, actor: session.actor, url: `graffiti:${crypto.randomUUID()}` } as GraffitiObjectBase;
    values.set(object.url, object);
    return object;
  });
  const unused = vi.fn();
  const sync = new GraffitiSynchronize({
    sessionEvents: new EventTarget(), login: unused, logout: unused,
    postMedia: unused, getMedia: unused, deleteMedia: unused,
    actorToHandle: unused, handleToActor: unused, discover, post,
    get: async (url: string) => values.get(url)!,
    delete: unused,
  } as unknown as Graffiti);
  mock.graffiti = sync;
  const store = new GraffitiRuleStore(sourceFromContext("https://guard.example", {}));
  store.connect(sync);
  const scopeComponent = { ...RuleStoreScope, render: () => null };
  const app = renderer.createApp({
    render: () => h("div", store.scopes.map((scope) => h(
      scopeComponent, { key: scope.key, store, scope },
    ))),
  });
  app.provide(ssrContextKey, {});
  app.mount({});
  const origin = "https://app.example";
  const site = [{ id: "chat", name: "Chat" }];
  const ask = vi.fn(async () => ({ allow: true, remember: true }));
  const guarded = new GuardedGraffiti(sync, new Guard(sync, store, origin, ask), undefined, origin);
  try {
    const ordinaryPosts = Promise.all(Array.from({ length: 20 }, (_, i) =>
      guarded.post({ value: { message: i }, channels: ["chat"] }, Object.assign({}, { actor: "alice" }, { source: site }))));
    await ordinaryPosts;
    expect(discover).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(20);
    expect(ask).not.toHaveBeenCalled();

    const foreign = await post({
      value: { "via site": { name: "Notes", id: '["https://notes.example"]' } },
      channels: ["notes"], allowed: [],
    }, { actor: "alice" });
    const firstRead = guarded.get(foreign.url, {}, Object.assign({}, { actor: "alice" }, { source: site }));
    await firstRead;
    await guarded.get(foreign.url, {}, Object.assign({}, { actor: "alice" }, { source: site }));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(post.mock.calls.filter(([input]) =>
      (input as GraffitiObjectBase).value.action === "Remember permission")).toHaveLength(1);

    // A new actor needs its own policy discovery, even on the same site.
    const otherActor = guarded.post({ value: {}, channels: [] }, Object.assign({}, { actor: "bob" }, { source: site }));
    await otherActor;
    const otherSite = guarded.post({ value: {}, channels: [] }, Object.assign({}, { actor: "alice" }, { source: [] }));
    await otherSite;
    expect(discover).toHaveBeenCalledTimes(3);
    expect(store.scopes).toHaveLength(3);
  } finally {
    app.unmount();
  }
});

it("loads once despite a partial discovery and synchronizes later rule changes", async () => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
  const source = {
    key: '["https://example.com","chat"]',
    origin: "https://example.com",
    path: [{ id: "chat", name: "Chat" }],
  };
  const session = { actor: "actor:one" };
  let posted: GraffitiObjectBase;
  const discover = vi.fn(async function* (_channels: string[]) {
    yield { error: new Error("inbox unavailable"), origin: "https://inbox.example" };
    return { cursor: "cursor" };
  });
  const unused = vi.fn();
  const graffiti = new GraffitiSynchronize({
    sessionEvents: new EventTarget(),
    login: unused, logout: unused, postMedia: unused, getMedia: unused,
    deleteMedia: unused, actorToHandle: unused, handleToActor: unused,
    discover,
    post: async (object: object) => (posted = {
      ...object, actor: session.actor, url: "graffiti:permission",
    } as GraffitiObjectBase),
    delete: async () => posted,
  } as unknown as Graffiti);
  mock.graffiti = graffiti;
  const store = new GraffitiRuleStore(sourceFromContext("https://guard.example", {}));
  const loading = store.load(source, session);
  const app = renderer.createApp(
    { ...RuleStoreScope, render: () => null },
    { store, scope: store.scopes[0] },
  );
  app.provide(ssrContextKey, {});
  app.mount({});

  try {
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(50);
    await loading;
    expect(await store.permissions(source, session.actor, "get")).toEqual([]);

    // A different caller using the same Graffiti instance writes the rule.
    const posting = graffiti.post({
      value: {
        action: "Remember permission",
        "confirm with guard": true,
        "via site": { name: "Permissions app", id: '["https://permissions.example"]' },
        published: Date.now(),
        site: { origin: source.origin, path: source.path },
        rule: {
          method: "get", decision: "allow",
          match: { kind: "site", site: '["https://producer.example"]' },
        },
      },
      channels: [`guard:permissions:site:${source.key}`, `guard:permissions:actor:${session.actor}`],
      allowed: [],
    }, session);
    await vi.advanceTimersByTimeAsync(50);
    await posting;
    expect(await store.permissions(source, session.actor, "get")).toHaveLength(1);

    const deleting = graffiti.delete("graffiti:permission", session);
    await vi.advanceTimersByTimeAsync(50);
    await deleting;
    expect(await store.permissions(source, session.actor, "get")).toEqual([]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(discover).toHaveBeenCalledTimes(1);
    expect(discover.mock.calls[0][0]).toEqual([`guard:permissions:site:${source.key}`]);
  } finally {
    app.unmount();
  }
});
