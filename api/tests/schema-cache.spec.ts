import { beforeEach, describe, expect, it, vi } from "vitest";
const observed = vi.hoisted(() => ({
  instances: [] as any[],
  failNext: false,
}));
vi.mock("ajv", async (original) => {
  const { default: Actual } = await original<typeof import("ajv")>();
  return {
    default: class extends Actual {
      constructor(options: any) {
        super(options);
        observed.instances.push(this);
        if (observed.failNext) {
          observed.failNext = false;
          throw new Error("Synthetic initialization failure");
        }
      }
    },
  };
});
beforeEach(() => {
  vi.resetModules();
  observed.instances.length = 0;
  observed.failNext = false;
});
const schema = {
  properties: {
    value: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" } },
      additionalProperties: false,
    },
  },
} as const;
const metadata = {
  channels: [],
  actor: "did:example:fixture",
  url: "graffiti:fixture",
};
async function loadCompile() {
  const { compileGraffitiObjectSchema } = await import("../src/4-utilities.js");
  // Exercise runtime schema handling independently of json-schema-to-ts inference.
  return compileGraffitiObjectSchema as (
    schema: any,
  ) => Promise<(value: any) => boolean>;
}
describe("compiled schema cache", () => {
  it("retries failed shared initialization without changing its error type", async () => {
    const compile = await loadCompile();
    observed.failNext = true;
    const failures = await Promise.allSettled(
      Array.from({ length: 20 }, () => compile(schema)),
    );
    expect(observed.instances).toHaveLength(1);
    for (const failure of failures) {
      expect(failure.status).toBe("rejected");
      if (failure.status === "rejected") {
        expect(failure.reason.name).toBe("Error");
        expect(failure.reason.message).toBe("Synthetic initialization failure");
      }
    }
    expect(
      (await compile(schema))({ ...metadata, value: { name: "fixture" } }),
    ).toBe(true);
    expect(observed.instances).toHaveLength(3);
  });

  it("shares initialization and a validator across concurrent cloned schemas", async () => {
    const compile = await loadCompile();
    const validators = await Promise.all(
      Array.from({ length: 50 }, () => compile(structuredClone(schema))),
    );
    expect(observed.instances).toHaveLength(2);
    expect(new Set(validators).size).toBe(1);
    expect(validators[0]({ ...metadata, value: { name: "fixture" } })).toBe(
      true,
    );
    expect(validators[0]({ ...metadata, value: { name: 1 } })).toBe(false);
    expect(validators[0]({ ...metadata, value: {} })).toBe(false);
    expect(
      validators[0]({ ...metadata, value: { name: "fixture", extra: true } }),
    ).toBe(false);
  });

  it("does not reuse a validator after caller schema mutation", async () => {
    const compile = await loadCompile();
    const mutable: any = structuredClone(schema);
    const first = await compile(mutable);
    mutable.properties.value.properties.name.type = "number";
    const second = await compile(mutable);
    expect(second).not.toBe(first);
    expect(first({ ...metadata, value: { name: "fixture" } })).toBe(true);
    expect(second({ ...metadata, value: { name: "fixture" } })).toBe(false);
    expect(second({ ...metadata, value: { name: 3 } })).toBe(true);
  });

  it("evicts the least recently used schema, including named schemas", async () => {
    const compile = await loadCompile();
    const named = (i: number) => ({ $id: `urn:fixture:${i}`, const: i });
    const first = await compile(named(0));
    const second = await compile(named(1));
    for (let i = 2; i < 128; i++) await compile(named(i));
    expect(await compile(named(0))).toBe(first); // Refresh the oldest entry.
    await compile(named(128));
    expect(await compile(named(0))).toBe(first);
    expect(await compile(named(1))).not.toBe(second);
    // Eviction does not invalidate a function already held by a query.
    expect(second(1)).toBe(true);
    expect(second(2)).toBe(false);
    // The long-lived validator contains only its built-in meta-schema.
    expect(observed.instances[0]._cache.size).toBe(1);
  });

  it("preserves local definitions, nested identifiers, anchors and recursive references", async () => {
    const compile = await loadCompile();
    const node = await compile({
      $id: "https://fixture.invalid/node",
      $defs: {
        name: { $anchor: "name", type: "string" },
        count: { $id: "count", type: "number" },
        flag: { type: "boolean" },
      },
      type: "object",
      properties: {
        name: { $ref: "#name" },
        count: { $ref: "count" },
        flag: { $ref: "#/$defs/flag" },
        next: { $ref: "https://fixture.invalid/node" },
      },
    });
    await compile({ $id: "https://fixture.invalid/node", type: "number" });
    expect(
      node({ name: "fixture", count: 2, flag: true, next: { name: "child" } }),
    ).toBe(true);
    expect(node({ name: 3 })).toBe(false);
    expect(node({ count: "wrong" })).toBe(false);
    expect(node({ flag: "wrong" })).toBe(false);
    expect(node({ next: { name: 3 } })).toBe(false);
  });

  it("rejects cross-query references even while the provider is cached", async () => {
    const compile = await loadCompile();
    const provider = {
      $id: "https://fixture.invalid/root",
      $defs: { child: { $id: "child", type: "number" } },
      properties: { value: { $ref: "child" } },
    };
    const original = await compile(provider);
    for (const ref of [provider.$id, "https://fixture.invalid/child"]) {
      await expect(compile({ $ref: ref })).rejects.toMatchObject({
        name: "GraffitiErrorInvalidSchema",
      });
    }
    expect(await compile(structuredClone(provider))).toBe(original);
    // A cache hit must not re-register the schema either.
    await expect(compile({ $ref: provider.$id })).rejects.toMatchObject({
      name: "GraffitiErrorInvalidSchema",
    });
    await expect(compile({ $schema: provider.$id })).rejects.toMatchObject({
      name: "GraffitiErrorInvalidSchema",
    });
  });

  it("lets concurrent callers reuse the same root and nested identifiers independently", async () => {
    const compile = await loadCompile();
    const [string, number] = await Promise.all(
      ["string", "number"].map((type) =>
        compile({
          $id: "https://fixture.invalid/shared",
          $defs: { value: { $id: "value", type } },
          properties: { value: { $ref: "value" } },
        }),
      ),
    );
    expect(string({ value: "fixture" })).toBe(true);
    expect(string({ value: 1 })).toBe(false);
    expect(number({ value: 1 })).toBe(true);
    expect(number({ value: "fixture" })).toBe(false);
  });

  it("keeps invalid schemas out of other queries", async () => {
    const compile = await loadCompile();
    for (let i = 0; i < 150; i++) {
      await expect(
        compile({
          $id: `https://fixture.invalid/broken-${i}`,
          $defs: { value: { $id: "value", type: "string" } },
          type: "invalid",
        }),
      ).rejects.toMatchObject({ name: "GraffitiErrorInvalidSchema" });
    }
    const valid = await compile({
      $id: "https://fixture.invalid/broken-149",
      $defs: { value: { $id: "value", type: "number" } },
      properties: { value: { $ref: "value" } },
    });
    expect(valid({ value: 1 })).toBe(true);
    expect(valid({ value: "wrong" })).toBe(false);
    expect(
      observed.instances[0].getSchema("https://fixture.invalid/value"),
    ).toBeUndefined();
    // The long-lived validator contains only its built-in meta-schema.
    expect(observed.instances[0]._cache.size).toBe(1);
  });

  it("handles Boolean schemas through the same bounded cache", async () => {
    const compile = await loadCompile();
    const always = await compile(true);
    const never = await compile(false);
    expect(await compile(true)).toBe(always);
    expect(await compile(false)).toBe(never);
    for (let i = 0; i < 128; i++) await compile({ const: i });
    expect(await compile(true)).not.toBe(always);
    expect(await compile(false)).not.toBe(never);
    expect(always({})).toBe(true);
    expect(never({})).toBe(false);
  });

  it("supports built-in meta-schemas across queries", async () => {
    const compile = await loadCompile();
    for (let i = 0; i < 3; i++) {
      for (const $schema of [
        "http://json-schema.org/schema#",
        "http://json-schema.org/draft-07/schema#",
      ]) {
        expect((await compile({ $schema, const: i }))(i)).toBe(true);
        await expect(
          compile({ $schema, type: "invalid", title: String(i) }),
        ).rejects.toMatchObject({ name: "GraffitiErrorInvalidSchema" });
      }
    }
  });
});
