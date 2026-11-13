import { afterEach, expect, it, vi } from "vitest";
import { compileGraffitiObjectSchema, type GraffitiObjectBase, type JSONSchema } from "@graffiti-garden/api";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiSynchronize, type GraffitiObjectStreamSuccess } from "./index";

vi.mock("@graffiti-garden/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@graffiti-garden/api")>();
  return { ...actual, compileGraffitiObjectSchema: vi.fn(actual.compileGraffitiObjectSchema) };
});
afterEach(() => vi.mocked(compileGraffitiObjectSchema).mockReset());

class ObservableSynchronize extends GraffitiSynchronize {
  get listenerCount() { return this.callbacks.size; }
  dispatch(update: GraffitiObjectStreamSuccess<{}>) {
    return this.synchronizeDispatch(update);
  }
}

function object(number: number): GraffitiObjectBase {
  return {
    url: `graffiti:did:example:author:object-${number}`,
    actor: "did:example:author",
    channels: ["visible", "hidden"],
    value: { number, keep: true },
    lastModified: number,
  };
}

async function delayCompilation(schema: JSONSchema) {
  const actual = await vi.importActual<typeof import("@graffiti-garden/api")>("@graffiti-garden/api");
  const validate = await actual.compileGraffitiObjectSchema(schema);
  let resolve!: (value: typeof validate) => void;
  let reject!: (error: Error) => void;
  const pending = new Promise<typeof validate>((yes, no) => { resolve = yes; reject = no; });
  vi.mocked(compileGraffitiObjectSchema).mockReturnValueOnce(pending);
  return { finish: () => resolve(validate), reject };
}

it("preserves early getter updates and tombstones in order, with snapshots and normal filters", async () => {
  const schema = { properties: { value: { properties: { keep: { const: true } } } } } as const;
  const compilation = await delayCompilation(schema);
  const local = new GraffitiLocal();
  const sync = new ObservableSynchronize(local);
  const stream = sync.synchronizeDiscover(["visible"], schema, { actor: "did:example:reader" });
  const next = stream.next();
  let delivered = false;
  void next.then(() => { delivered = true; });
  const first = object(1);
  vi.spyOn(local, "get").mockResolvedValue(first);

  await sync.get(first.url, {});
  await sync.dispatch({ tombstone: true, object: first });
  first.value.number = 99;
  first.channels.push("changed-after-dispatch");
  await sync.dispatch({ object: { ...object(2), channels: ["other"] } });
  await sync.dispatch({ object: { ...object(3), allowed: ["did:example:other"] } });
  await sync.dispatch({ object: { ...object(4), value: { keep: false } } });
  expect(delivered).toBe(false);
  compilation.finish();

  await expect(next).resolves.toMatchObject({ value: { object: {
    value: { number: 1 }, channels: ["visible"],
  } } });
  await expect(stream.next()).resolves.toMatchObject({ value: {
    tombstone: true, object: { value: { number: 1 }, channels: ["visible"] },
  } });
  await sync.dispatch({ object: object(5) });
  await expect(stream.next()).resolves.toMatchObject({ value: { object: { value: { number: 5 } } } });
  await stream.return(null);
  expect(sync.listenerCount).toBe(0);
});

it("cancels while compilation is pending and handles its later rejection", async () => {
  const compilation = await delayCompilation({});
  const sync = new ObservableSynchronize(new GraffitiLocal());
  const stream = sync.synchronizeAll({});
  const next = stream.next();
  await sync.dispatch({ object: object(1) });
  expect(sync.listenerCount).toBe(1);
  await expect(stream.return(null)).resolves.toMatchObject({ done: true });
  await expect(next).resolves.toMatchObject({ done: true });
  expect(sync.listenerCount).toBe(0);
  compilation.reject(new Error("Compilation finished after cancellation"));
});

it("removes its early listener when compilation fails", async () => {
  const compilation = await delayCompilation({});
  const sync = new ObservableSynchronize(new GraffitiLocal());
  const stream = sync.synchronizeAll({});
  const failure = expect(stream.next()).rejects.toThrow("Invalid schema");
  await sync.dispatch({ object: object(1) });
  compilation.reject(new Error("Invalid schema"));
  await failure;
  expect(sync.listenerCount).toBe(0);
});
