import { vi } from "vitest";

// Only the Cache methods used by discovery are needed here. The tests use
// Node's native Web Locks; browser checks exercise the real Cache API too.
export function mockCacheStorage() {
  function create() {
    const entries = new Map<string, Response>();
    return {
      entries,
      keys: vi.fn(async () => [...entries.keys()].map(key => new Request(key))),
      match: vi.fn(async (key: string) => entries.get(key)?.clone()),
      put: vi.fn(async (key: string, response: Response) => { entries.set(key, response.clone()); }),
      delete: vi.fn(async (key: string) => entries.delete(key)),
    };
  }
  const stores = new Map<string, ReturnType<typeof create>>();
  const store = (name: string) => {
    let cache = stores.get(name);
    if (!cache) { cache = create(); stores.set(name, cache); }
    return cache;
  };
  vi.stubGlobal("caches", { open: vi.fn(async (name: string) => store(name)) });
  return store;
}
