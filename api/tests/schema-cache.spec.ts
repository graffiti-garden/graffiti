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
describe("compiled schema cache", () => {
  it("retries a failed shared initialization without changing its error type", async () => {
    const { compileGraffitiObjectSchema } = await import(
      "../src/4-utilities.js"
    );
    const compile = compileGraffitiObjectSchema as (
      schema: any,
    ) => Promise<(value: any) => boolean>;
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
    expect(observed.instances).toHaveLength(2);
  });
  it("coalesces cold initialization and cloned schemas", async () => {
    const { compileGraffitiObjectSchema } = await import(
      "../src/4-utilities.js"
    );
    // These are runtime/cache tests, not json-schema-to-ts inference tests.
    const compile = compileGraffitiObjectSchema as (
      schema: any,
    ) => Promise<(value: any) => boolean>;
    const validators = await Promise.all(
      Array.from({ length: 50 }, () => compile(structuredClone(schema))),
    );
    expect(observed.instances).toHaveLength(1);
    expect(new Set(validators).size).toBe(1);
    expect(observed.instances[0]._cache.size).toBe(2);
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
    const { compileGraffitiObjectSchema } = await import(
      "../src/4-utilities.js"
    );
    // These are runtime/cache tests, not json-schema-to-ts inference tests.
    const compile = compileGraffitiObjectSchema as (
      schema: any,
    ) => Promise<(value: any) => boolean>;
    const mutable: any = structuredClone(schema);
    const first = await compile(mutable);
    mutable.properties.value.properties.name.type = "number";
    const second = await compile(mutable);
    expect(second).not.toBe(first);
    expect(first({ ...metadata, value: { name: "fixture" } })).toBe(true);
    expect(second({ ...metadata, value: { name: "fixture" } })).toBe(false);
    expect(second({ ...metadata, value: { name: 3 } })).toBe(true);
  });
  it("bounds both caches and recompiles evicted schemas correctly", async () => {
    const { compileGraffitiObjectSchema } = await import(
      "../src/4-utilities.js"
    );
    // These are runtime/cache tests, not json-schema-to-ts inference tests.
    const compile = compileGraffitiObjectSchema as (
      schema: any,
    ) => Promise<(value: any) => boolean>;
    const first = await compile({ properties: { value: { const: 0 } } });
    for (let i = 1; i <= 150; i++)
      await compile({ properties: { value: { const: i } } });
    expect(observed.instances[0]._cache.size).toBeLessThanOrEqual(129);
    expect(first({ ...metadata, value: 0 })).toBe(true);
    expect(first({ ...metadata, value: 1 })).toBe(false);
    const again = await compile({ properties: { value: { const: 0 } } });
    expect(again).not.toBe(first);
    expect(again({ ...metadata, value: 0 })).toBe(true);
    expect(again({ ...metadata, value: 1 })).toBe(false);
  });
  it("retains local references and errors for invalid schemas", async () => {
    const { compileGraffitiObjectSchema } = await import(
      "../src/4-utilities.js"
    );
    // These are runtime/cache tests, not json-schema-to-ts inference tests.
    const compile = compileGraffitiObjectSchema as (
      schema: any,
    ) => Promise<(value: any) => boolean>;
    const validator = await compile({
      $defs: { name: { type: "string" } },
      properties: { value: { $ref: "#/$defs/name" } },
    });
    expect(validator({ ...metadata, value: "fixture" })).toBe(true);
    expect(validator({ ...metadata, value: 3 })).toBe(false);
    await expect(compile({ type: "invalid" } as any)).rejects.toThrow();
  });
  it("preserves separately compiled root and nested identifiers after anonymous eviction", async () => {
    const { compileGraffitiObjectSchema } = await import(
      "../src/4-utilities.js"
    );
    const compile = compileGraffitiObjectSchema as (
      schema: any,
    ) => Promise<(value: any) => boolean>;
    const root = { $id: "https://fixture.invalid/root", type: "string" };
    const withNested = {
      $id: "https://fixture.invalid/base/",
      $defs: { number: { $id: "number", type: "number" } },
      properties: { value: { $ref: "number" } },
    };
    const anonymousRoot = {
      $defs: { flag: { $id: "https://fixture.invalid/flag", type: "boolean" } },
    };
    const original = await compile(root);
    await compile(withNested);
    await compile(anonymousRoot);
    expect((await compile({ $ref: root.$id }))("fixture")).toBe(true);
    for (let i = 0; i < 150; i++) await compile({ type: "number", minimum: i });
    expect(
      (await compile({ $ref: root.$id, title: "later root consumer" }))(
        "fixture",
      ),
    ).toBe(true);
    const number = await compile({
      $ref: "https://fixture.invalid/base/number",
    });
    expect(number(2)).toBe(true);
    expect(number("wrong")).toBe(false);
    // AJV cannot resolve a separate root's reference into an anonymous root,
    // even without eviction. Retain that root conservatively without inventing
    // new cross-root reference behavior here.
    expect(await compile(structuredClone(anonymousRoot))).toBeDefined();
    expect(await compile(structuredClone(root))).toBe(original);
    // Three explicitly named roots retain their baseline registry lifetime;
    // the anonymous cache remains bounded in addition to those registrations.
    expect(observed.instances[0]._cache.size).toBeLessThanOrEqual(132);
  });
  it("does not mistake literal data containing identifiers for named schemas", async () => {
    const { compileGraffitiObjectSchema } = await import(
      "../src/4-utilities.js"
    );
    const compile = compileGraffitiObjectSchema as (
      schema: any,
    ) => Promise<(value: any) => boolean>;
    for (let i = 0; i < 150; i++) {
      const data = { $id: `literal-${i}` };
      const validator = await compile({
        const: data,
        default: data,
        enum: [data],
        examples: [data],
      });
      expect(validator(data)).toBe(true);
    }
    expect(observed.instances[0]._cache.size).toBeLessThanOrEqual(129);
  });
  it("does not retain invalid anonymous schemas in AJV's identity cache", async () => {
    const { compileGraffitiObjectSchema } = await import(
      "../src/4-utilities.js"
    );
    const compile = compileGraffitiObjectSchema as (
      schema: any,
    ) => Promise<(value: any) => boolean>;
    for (let i = 0; i < 150; i++) {
      await expect(
        compile({ type: "invalid", title: String(i) }),
      ).rejects.toMatchObject({ name: "GraffitiErrorInvalidSchema" });
    }
    expect(observed.instances[0]._cache.size).toBe(1);
    expect((await compile(true))({})).toBe(true);
    expect((await compile(false))({})).toBe(false);
  });
});
