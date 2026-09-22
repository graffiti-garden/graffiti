import type { Graffiti } from "@graffiti-garden/api";
import { describe, expect, it, vi } from "vitest";
import {
  GraffitiRuleStore,
  ruleSchema,
  rulesFromObjects,
} from "../src/core/rules.js";

const source = {
  key: '["https://example.com","chat"]',
  origin: "https://example.com",
  path: [{ id: "chat", name: "Chat" }],
};
const session = { actor: "actor:one", source: source.path };

describe("Graffiti permission rules", () => {
  it("queries by shape and posting actor without restricting extensions", () => {
    const schema = ruleSchema(session.actor) as any;

    expect(schema.required).toBeUndefined();
    expect(schema.properties.allowed).toBeUndefined();
    expect(schema.properties.actor).toEqual({ const: session.actor });
    expect(schema.properties.value.additionalProperties).toBeUndefined();
    expect(schema.properties.value.properties.type).toBeUndefined();
    expect(schema.properties.value.properties.version).toBeUndefined();
    expect(JSON.stringify(schema)).not.toContain('"schema"');
    expect(JSON.stringify(schema)).toContain('"example"');
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

  it("accepts an expanded rule posted by the actor", () => {
    const [rule] = rulesFromObjects(
      [
        {
          url: "graffiti:permission",
          actor: session.actor,
          channels: [source.key, session.actor],
          value: {
            published: 10,
            site: {
              origin: source.origin,
              path: source.path,
              futureSiteField: true,
            },
            rule: {
              method: "logout",
              decision: "allow",
              match: { kind: "logout", futureMatchField: true },
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
        method: "logout",
        decision: "allow",
        createdAt: 10,
      },
    });
  });

  it("posts one private object to the site and actor channels", async () => {
    const post = vi.fn(async (value: any) => ({
      ...value,
      actor: session.actor,
      url: "graffiti:permission",
    }));
    const store = new GraffitiRuleStore();
    store.connect({ post } as unknown as Graffiti);

    const loading = store.load(source, session);
    const scope = store.scopes[0];
    store.update(scope, [], true);
    await loading;
    await store.remember({
      source,
      actor: session.actor,
      method: "post",
      decision: "allow",
      match: {
        kind: "object",
        example: { activity: "Wave" },
      },
    });

    expect(post).toHaveBeenCalledWith(
      {
        value: {
          published: expect.any(Number),
          site: { origin: source.origin, path: source.path },
          rule: {
            method: "post",
            decision: "allow",
            match: {
              kind: "object",
              example: { activity: "Wave" },
            },
          },
        },
        channels: [source.key, session.actor],
        allowed: [],
      },
      session,
    );
  });
});
