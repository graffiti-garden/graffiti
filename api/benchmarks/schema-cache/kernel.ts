import { compileGraffitiObjectSchema as compile } from "fixture-api";
import { matches } from "fixture-permissions";

// Shape copied from the public UIST People HTML. All values below are synthetic.
export const profileSchema = {
  properties: {
    value: {
      type: "object",
      required: ["name", "research interests", "open to meeting", "time"],
      properties: {
        name: { type: "string", minLength: 1 },
        "profile picture": { type: "string" },
        "profile picture description": {
          type: "string",
          minLength: 1,
          maxLength: 200,
        },
        pronouns: { type: "string" },
        "research interests": { type: "string", minLength: 1 },
        "presentation IDs": {
          type: "array",
          items: { anyOf: [{ type: "number" }, { type: "string" }] },
        },
        "open to meeting": { type: "boolean" },
        "how to reach me": { type: "string" },
        role: { type: "string" },
        opportunities: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
        },
        time: { type: "number" },
      },
    },
  },
};
const value = {
  name: "Synthetic fixture",
  "research interests": "Interface research",
  "open to meeting": false,
  time: 1,
  type: "Profile",
  opportunities: ["collaboration"],
  "presentation IDs": [1, "paper"],
};
const object = {
  value,
  actor: "did:example:public-fixture",
  channels: ["fixture"],
  url: "graffiti:fixture",
};
const clone = (v: any) => JSON.parse(JSON.stringify(v));
let calls = 0,
  checks = 0,
  failures: string[] = [];
function assert(ok: boolean, description: string) {
  checks++;
  if (!ok) failures.push(description);
}
export function stats() {
  const instances = (globalThis as any).__ajvInstances ?? [];
  return {
    calls,
    checks,
    failures,
    instances: instances.length,
    ajvCacheSizes: instances.map((i: any) => i._cache.size),
    ajvCacheTotal: instances.reduce(
      (n: number, i: any) => n + i._cache.size,
      0,
    ),
  };
}
export async function direct(scenario: any) {
  const start = performance.now();
  const validators: any[] = [];
  async function once(i: number) {
    const schema =
      scenario.kind === "same-identity" ? profileSchema : clone(profileSchema);
    if (scenario.kind === "unique")
      schema.properties.value.properties[`unique_${i}`] = { type: "boolean" };
    calls++;
    const validate = await compile(schema);
    validators.push(validate);
    assert(validate(object), "valid profile rejected");
    assert(
      !validate({ ...object, value: { ...value, name: 123 } }),
      "wrong profile field accepted",
    );
  }
  if (scenario.kind === "concurrent")
    await Promise.all(
      Array.from({ length: scenario.count }, (_, i) => once(i)),
    );
  else for (let i = 0; i < scenario.count; i++) await once(i);
  return {
    ms: performance.now() - start,
    validatorIdentities: new Set(validators).size,
    ...stats(),
  };
}
export function kernel(scenario: any) {
  const sessionEvents = new EventTarget();
  const api = {
    sessionEvents,
    async *discover(channels: string[], schema: any) {
      const query = Number(channels[0].split(":")[1]);
      calls++;
      const validate =
        scenario.kind === "passthrough" ? undefined : await compile(schema);
      const example = {
        ...value,
        type: scenario.kind === "unique" ? `Profile${query}` : "Profile",
      };
      const permission = { match: { site: "https://fixture.invalid" } } as any;
      for (let i = 0; i < scenario.objects; i++) {
        const item = {
          ...object,
          url: `graffiti:fixture:${query}:${i}`,
          value: { ...example, time: i },
        };
        if (validate)
          assert(validate(item), "RPC schema rejected valid fixture");
        if (scenario.kind !== "passthrough")
          assert(
            matches(permission, { site: "https://fixture.invalid" } as any),
            "RPC permission rejected fixture",
          );
        yield { object: item };
      }
      return { cursor: "fixture-end" };
    },
    async get() {
      return object;
    },
    async actorToHandle(actor: string) {
      return actor;
    },
    async handleToActor(handle: string) {
      return handle;
    },
  };
  return api;
}
export async function compatibility() {
  const outcomes: any = {};
  const id = "https://fixture.invalid/global-shape";
  await compile({ $id: id, type: "string" } as any);
  await compile({
    $id: "https://fixture.invalid/base/",
    $defs: { number: { $id: "number", type: "number" } },
    properties: { value: { $ref: "number" } },
  } as any);
  outcomes.globalRefBeforeEviction = (await compile({ $ref: id } as any))(
    "fixture" as any,
  );
  for (let i = 0; i < 150; i++)
    await compile({ type: "number", minimum: i } as any);
  try {
    outcomes.globalRefAfterEviction = (
      await compile({ $ref: id, title: "new consumer" } as any)
    )("fixture" as any);
  } catch (e) {
    outcomes.globalRefAfterEviction = String(e);
  }
  const local = await compile({
    $defs: { value: { type: "string" } },
    properties: { value: { $ref: "#/$defs/value" } },
  } as any);
  outcomes.localRefWorks =
    local({ value: "fixture" } as any) && !local({ value: 2 } as any);
  const nested = await compile({
    $ref: "https://fixture.invalid/base/number",
  } as any);
  outcomes.nestedIdAfterEviction = nested(3 as any) && !nested("wrong" as any);
  return { outcomes, ...stats() };
}
