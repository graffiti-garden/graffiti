import { encode, decode } from "@ipld/dag-cbor";

/** Bound time waiting for another tab, never interrupt work holding the lock. */
export async function withLock<T>(
  locks: LockManager,
  name: string,
  work: () => Promise<T>,
  { mode = "exclusive", signal }: { mode?: LockMode; signal?: AbortSignal } = {},
): Promise<T> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new DOMException("Lock wait timed out", "TimeoutError")), 30_000);
  let acquired = false;
  try {
    return await locks.request(name, {
      mode, signal: signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal,
    }, () => {
      acquired = true;
      // Hot outbox operations must not leave thousands of unused deadline
      // timers/signals alive for another thirty seconds after acquiring a lock.
      clearTimeout(timer);
      return work();
    });
  } catch (error) {
    if (!acquired && timeout.signal.aborted) throw new Error("Timed out waiting for another tab's Graffiti storage lock", { cause: error });
    throw error;
  } finally { clearTimeout(timer); }
}

// Safari can discard iframe IndexedDB on exit; its partitioned Cache API persists.
// Each store stays on this origin and is separate for each embedding website.
export async function createCache<T>(name: string) {
  const locks = globalThis.navigator?.locks;
  let cache: Cache | undefined;
  if (globalThis.caches && locks) {
    try { cache = await caches.open(name); } catch {}
  }
  // Node and browsers that block storage keep the existing in-memory behavior.
  const memory = new Map<string, T>();
  let pending: Promise<unknown> = Promise.resolve();
  // Cache requires HTTP-shaped keys. These URLs are only keys, never fetched.
  const url = (key: string) => `https://graffiti.invalid/?key=${encodeURIComponent(key)}`;

  return {
    shared: cache !== undefined,
    async keys(): Promise<string[]> {
      if (!cache) return [...memory.keys()];
      return (await cache.keys()).map(request => new URL(request.url).searchParams.get("key")!);
    },
    async get(key: string): Promise<T | undefined> {
      if (!cache) return structuredClone(memory.get(key));
      const response = await cache.match(url(key));
      return response ? decode<T>(new Uint8Array(await response.arrayBuffer())) : undefined;
    },
    async set(key: string, value: T): Promise<void> {
      if (!cache) { memory.set(key, structuredClone(value)); return; }
      // These responses are only internal CBOR records. Unneeded HTTP headers
      // make Firefox's Cache matching slower as its headers table grows.
      await cache.put(url(key), new Response(new Uint8Array(encode(value))));
    },
    async delete(key: string): Promise<void> {
      if (cache) await cache.delete(url(key));
      else memory.delete(key);
    },
    // Cache.put replaces one entry atomically, but read/modify/write needs a
    // lock across tabs. Memory-only stores need only an instance-local queue.
    lock<R>(work: () => Promise<R>, mode: LockMode = "exclusive"): Promise<R> {
      if (cache && locks) return withLock(locks, `graffiti:cache:${name}`, work, { mode });
      const result = pending.then(work, work);
      pending = result.catch(() => {});
      return result;
    },
  };
}

/** Bound concurrent response streams, and finish in-flight work before unlocking. */
export async function cacheBatch<T, R>(items: T[], work: (item: T) => Promise<R>, concurrency = 128): Promise<R[]> {
  const values: R[] = [];
  for (let start = 0; start < items.length; start += concurrency) {
    const results = await Promise.allSettled(items.slice(start, start + concurrency).map(work));
    for (const result of results) {
      if (result.status === "rejected") throw result.reason;
      values.push(result.value);
    }
  }
  return values;
}
