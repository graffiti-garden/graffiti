import type { Graffiti, GraffitiObjectBase, GraffitiPostObject } from "@graffiti-garden/api";
import { describe, expect, it, vi } from "vitest";
import {
  GraffitiRuleStore,
  ruleSchema,
  ruleSites,
  rulesFromObjects,
} from "../src/core/rules.js";
import { sourceFromContext } from "../src/core/source.js";

const source = {
  key: '["https://example.com","chat"]',
  origin: "https://example.com",
  path: [{ id: "chat", name: "Chat" }],
};
const session = { actor: "actor:one", source: source.path };
const guardSource = sourceFromContext("https://guard.example", {});

describe("Graffiti permission rules", () => {
  it("shows a rule from either site without granting the data's site access in return", () => {
    const producer = sourceFromContext("https://producer.example", {});
    const object = {
      url: "graffiti:permission", actor: session.actor, allowed: [],
      // Older records need no extra channel to appear in either site's audit.
      channels: [`guard:permissions:actor:${session.actor}`],
      value: {
        action: "Remember permission", "confirm with guard": true, published: 10,
        site: { origin: source.origin, path: source.path },
        rule: { method: "get", decision: "deny", match: { kind: "site", site: producer.key } },
      },
    };
    const [rule] = rulesFromObjects([object], session.actor);
    expect(ruleSites(rule)).toEqual([source.key, producer.key]);
    expect(rulesFromObjects([object], session.actor, producer)).toEqual([]);
    expect(ruleSites({ kind: "site-block", block: {
      id: "graffiti:block", source, actor: session.actor, createdAt: 10,
    } })).toEqual([source.key]);
  });

  it("queries confirmed permission records by actor", () => {
    const schema = ruleSchema(session.actor) as any;

    expect(schema.required).toBeUndefined();
    expect(schema.properties.allowed).toBeUndefined();
    expect(schema.properties.actor).toEqual({ const: session.actor });
    expect(schema.properties.value.additionalProperties).toBeUndefined();
    expect(schema.properties.value.required).toEqual(["action", "confirm with guard"]);
    expect(schema.properties.value.properties.action).toEqual({ const: "Remember permission" });
    expect(schema.properties.value.properties["confirm with guard"]).toEqual({ const: true });
  });

  it("does not load obsolete schema-based rules", () => {
    expect(
      rulesFromObjects(
        [
          {
            url: "graffiti:old-permission",
            actor: session.actor,
            channels: [source.key, session.actor],
            value: {
              published: 10,
              site: { origin: source.origin, path: source.path },
              rule: {
                method: "post",
                decision: "allow",
                match: {
                  kind: "object",
                  schema: { type: "object" },
                },
              },
            },
          } as any,
        ],
        session.actor,
        source,
      ),
    ).toEqual([]);
  });

  it("accepts a confirmed rule from another app with additional fields", () => {
    const [rule] = rulesFromObjects(
      [
        {
          url: "graffiti:permission",
          actor: session.actor,
          channels: [`guard:permissions:site:${source.key}`, `guard:permissions:actor:${session.actor}`],
          value: {
            action: "Remember permission",
            "confirm with guard": true,
            "via site": { name: "Permissions app", id: '["https://permissions.example"]' },
            published: 10,
            site: {
              origin: source.origin,
              path: source.path,
              futureSiteField: true,
            },
            rule: {
              method: "get",
              decision: "allow",
              match: { kind: "site", site: "producer", futureMatchField: true },
              futureRuleField: true,
            },
            futureValueField: true,
          },
          futureObjectField: true,
        } as any,
      ],
      session.actor,
      source,
    );

    expect(rule).toMatchObject({
      kind: "permission",
      permission: {
        id: "graffiti:permission",
        actor: session.actor,
        method: "get",
        decision: "allow",
        createdAt: 10,
      },
    });
  });

  it.each([undefined, false])("ignores an unconfirmed permission (%s)", (confirmation) => {
    const object = {
      url: "graffiti:unconfirmed",
      actor: session.actor,
      channels: [`guard:permissions:site:${source.key}`],
      value: {
        action: "Remember permission",
        ...(confirmation === undefined ? {} : { "confirm with guard": confirmation }),
        published: 10,
        site: { origin: source.origin, path: source.path },
        rule: { method: "get", decision: "allow", match: { kind: "site", site: "producer" } },
      },
    };
    expect(rulesFromObjects([object], session.actor, source)).toEqual([]);
  });

  it("rejects a policy record for a different site and a media receipt", () => {
    const value = {
      published: 10,
      site: { origin: source.origin, path: source.path },
      rule: {
        method: "get",
        decision: "allow",
        match: { kind: "site", site: '["https://producer.example"]' },
      },
    };
    const objects = [
      {
        url: "graffiti:wrong-site",
        actor: session.actor,
        channels: [source.key],
        value: {
          ...value,
          site: { origin: source.origin, path: [{ id: "another-page", name: "Other" }] },
          action: "Remember permission",
          "confirm with guard": true,
        },
      },
      {
        url: "graffiti:media-receipt",
        actor: session.actor,
        channels: [source.key],
        value: {
          ...value,
          "via site": { name: "Chat", id: source.key },
          _guard: { kind: "media-receipt" },
        },
      },
    ] as any;
    expect(rulesFromObjects(objects, session.actor, source)).toEqual([]);
  });

  it("posts one private confirmed object stamped with the guard's own site", async () => {
    const post = vi.fn(async (value: any) => ({
      ...value,
      actor: session.actor,
      url: "graffiti:permission",
    }));
    const store = new GraffitiRuleStore(guardSource);
    store.connect({ post } as unknown as Graffiti);

    const loading = store.load(source, session);
    const scope = store.scopes[0];
    store.update(scope, [], true);
    await loading;
    await store.remember({
      source,
      actor: session.actor,
      method: "get",
      decision: "allow",
      match: { kind: "site", site: '["https://producer.example"]' },
    });

    expect(post).toHaveBeenCalledWith(
      {
        value: {
          action: "Remember permission",
          "confirm with guard": true,
          "via site": { name: "guard.example", id: guardSource.key },
          published: expect.any(Number),
          site: { origin: source.origin, path: source.path },
          rule: {
            method: "get",
            decision: "allow",
            match: { kind: "site", site: '["https://producer.example"]' },
          },
        },
        channels: [`guard:permissions:site:${source.key}`, `guard:permissions:actor:${session.actor}`],
        allowed: [],
      },
      session,
    );
  });

  it("replaces remembered decisions without removing unrelated permissions", async () => {
    const objects = new Map<string, GraffitiObjectBase>();
    const post = vi.fn(async (value: GraffitiPostObject<{}>) => {
      const object = { ...value, actor: session.actor, url: crypto.randomUUID() };
      objects.set(object.url, object);
      return object;
    });
    const remove = vi.fn(async (url: string) => {
      const object = objects.get(url)!;
      objects.delete(url);
      return object;
    });
    const store = new GraffitiRuleStore(guardSource);
    store.connect({ post, delete: remove } as unknown as Graffiti);
    const loading = store.load(source, session);
    store.update(store.scopes[0], [], true);
    await loading;

    const permission = {
      source,
      actor: session.actor,
      method: "get" as const,
      match: { kind: "site" as const, site: '["https://producer.example"]' },
    };
    const first = await store.remember({ ...permission, decision: "allow" });
    const otherMethod = await store.remember({
      ...permission, method: "delete", decision: "allow",
    });
    const otherSite = await store.remember({
      ...permission,
      match: { kind: "site", site: '["https://other.example"]' },
      decision: "allow",
    });

    const denied = await store.remember({ ...permission, decision: "deny" });
    expect(objects.has(first.id)).toBe(false);
    expect(await store.permissions(source, session.actor, "get"))
      .toEqual([otherSite, denied]);

    post.mockRejectedValueOnce(new Error("write failed"));
    await expect(store.remember({ ...permission, decision: "allow" }))
      .rejects.toThrow("write failed");
    expect(objects.has(denied.id)).toBe(true);

    const allowed = await store.remember({ ...permission, decision: "allow" });
    expect(objects.has(denied.id)).toBe(false);
    expect([...objects.keys()]).toEqual([otherMethod.id, otherSite.id, allowed.id]);

    // A later discovery sees only the current decisions, without needing the
    // replacement and its predecessor to arrive together.
    expect(rulesFromObjects([...objects.values()], session.actor, source)
      .filter((rule) => rule.kind === "permission")
      .map((rule) => rule.permission.id))
      .toEqual([otherMethod.id, otherSite.id, allowed.id]);

    await store.revoke(allowed.id);
    expect(objects.has(allowed.id)).toBe(false);
    expect(await store.permissions(source, session.actor, "get")).toEqual([otherSite]);
  });

  it("waits for initial loading and keeps known rules during a reload", async () => {
    const store = new GraffitiRuleStore(guardSource);
    const loading = store.load(source, session);
    const scope = store.scopes[0];
    const block = {
      url: "graffiti:block",
      actor: session.actor,
      channels: [`guard:permissions:site:${source.key}`, `guard:permissions:actor:${session.actor}`],
      allowed: [],
      value: {
        action: "Remember permission",
        "confirm with guard": true,
        published: 10,
        site: { origin: source.origin, path: source.path },
        rule: { kind: "site-block" },
      },
    };

    store.update(scope, [block], false);
    const ready = vi.fn();
    void loading.then(ready);
    await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();
    expect(scope.rules).toEqual([]);

    store.update(scope, [block], true);
    await loading;
    expect(await store.isSourceBlocked(source, session.actor)).toBe(true);

    store.update(scope, [], false);
    expect(await store.isSourceBlocked(source, session.actor)).toBe(true);
  });

  it("stores and removes a block for only its site and actor", async () => {
    const store = new GraffitiRuleStore(guardSource);
    const post = vi.fn(async (object: GraffitiPostObject<{}>) => ({
      ...object, actor: session.actor, url: "graffiti:block",
    }));
    const remove = vi.fn(async () => ({}));
    store.connect({ post, delete: remove } as unknown as Graffiti);
    const other = sourceFromContext(source.origin, { source: [{ id: "other", name: "Other" }] });
    for (const [site, actor] of [[source, session.actor], [source, "actor:two"], [other, session.actor]] as const) {
      const loading = store.load(site, { actor });
      store.update(store.scopes.at(-1)!, [], true);
      await loading;
    }

    const block = await store.blockSource(source, session.actor);
    expect(await store.blockSource(source, session.actor)).toEqual(block);
    expect(post).toHaveBeenCalledOnce();
    expect(await store.isSourceBlocked(source, session.actor)).toBe(true);
    expect(await store.isSourceBlocked(source, "actor:two")).toBe(false);
    expect(await store.isSourceBlocked(other, session.actor)).toBe(false);

    await store.revoke(block.id, session.actor);
    expect(remove).toHaveBeenCalledWith(block.id, { actor: session.actor });
    expect(await store.isSourceBlocked(source, session.actor)).toBe(false);
  });
});
