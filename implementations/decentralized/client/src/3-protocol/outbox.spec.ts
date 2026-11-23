import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { GraffitiErrorCursorExpired, GraffitiErrorNotFound, type GraffitiObjectStream } from "@graffiti-garden/api";
import { GraffitiDecentralized } from "./5-graffiti";
import { mockCacheStorage } from "./4-discovery/cache-tests";

const session = { actor: "did:example:writer" };
class Client extends GraffitiDecentralized {
  get services() {
    return { sessions: this.sessions, storage: this.storageBuckets, inboxes: this.inboxes, history: this.inboxHistory };
  }
  get localWrites() { return this.outbox; }
}

let cacheStores: ReturnType<typeof mockCacheStorage>;
beforeEach(() => { vi.useFakeTimers(); cacheStores = mockCacheStorage(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function client(writeGracePeriod = 60_000) {
  const graffiti = new Client({ writeGracePeriod, defaultInboxEndpoints: [] });
  const service = { token: "token", authorizationEndpoint: "https://test.invalid/auth" };
  vi.spyOn(graffiti.services.sessions, "resolveSession").mockReturnValue({
    ...session, tokens: [], servicesByAuthorization: [],
    storageBucket: { ...service, serviceEndpoint: "https://test.invalid/bucket" },
    personalInbox: { ...service, serviceEndpoint: "https://test.invalid/inbox" },
    sharedInboxes: [],
  });
  const put = vi.spyOn(graffiti.services.storage, "put").mockResolvedValue();
  const remove = vi.spyOn(graffiti.services.storage, "delete").mockResolvedValue();
  vi.spyOn(graffiti.services.inboxes, "send").mockResolvedValue("announcement");
  vi.spyOn(graffiti.services.inboxes, "pin").mockResolvedValue();
  vi.spyOn(graffiti.services.history, "query").mockImplementation(async function* () { return ""; });
  vi.spyOn(graffiti.services.history, "continueQuery").mockImplementation(async function* () { return ""; });
  return { graffiti, put, remove };
}

async function page(iterator: GraffitiObjectStream<{}>) {
  const entries = [];
  while (true) {
    const result = await iterator.next();
    if (result.done) return { entries, cursor: result.value.cursor };
    entries.push(result.value);
  }
}

test("recovers locally accepted writes and flushes only the requested URL", async () => {
  const { graffiti, put } = client();
  const first = await graffiti.post({ value: { x: 1 }, channels: ["game"], allowed: [] }, session);
  const second = await graffiti.post({ value: { x: 2 }, channels: ["game"] }, session);
  expect(put).not.toHaveBeenCalled();
  const restored = client();
  expect(await restored.graffiti.get(first, {}, session)).toEqual(first);
  await expect(restored.graffiti.get(first, {})).rejects.toBeInstanceOf(GraffitiErrorNotFound);
  await restored.graffiti.flush(first.url, session);
  expect(restored.put).toHaveBeenCalledTimes(1);
  await restored.graffiti.flush(second.url, session);
  expect(restored.put).toHaveBeenCalledTimes(2);
  expect((await restored.graffiti.localWrites.read()).writes).toEqual([]);
});

test("pending uploads do not depend on the discovery clock", async () => {
  const { graffiti, put } = client(1000);
  const first = await graffiti.post({ value: { signal: 1 }, channels: [] }, session);
  await graffiti.post({ value: { signal: 2 }, channels: [] }, session);
  // The failed Safari reload could read pending records but not this key.
  await (await graffiti.localWrites.store).delete("clock");
  await graffiti.flush(first.url, session);
  expect(put).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1000);
  await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(2));
});

test("deletion cancels an unstarted upload and appears in continued local discovery", async () => {
  const { graffiti, put, remove } = client();
  const object = await graffiti.post({ value: { x: 1 }, channels: ["game"] }, session);
  const initial = graffiti.discover(["game"], {}, session);
  expect((await initial.next()).value).toEqual({ object });
  const end = await initial.next();
  if (!end.done) throw new Error("Expected the discovery cursor");
  await graffiti.delete(object, session);
  await graffiti.flush(object.url, session);
  expect(put).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  await expect(graffiti.get(object, {}, session)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
  const next = graffiti.continueDiscover(end.value.cursor, session);
  expect((await next.next()).value).toEqual({ object, tombstone: true });
  await next.return({ cursor: "" });
});

test("retrying a failed flush reuses the exact storage key and encoded bytes", async () => {
  const { graffiti, put } = client();
  const object = await graffiti.post({ value: { text: "keep me" }, channels: [] }, session);
  put.mockRejectedValueOnce(new Error("offline"));
  await expect(graffiti.flush(object.url, session)).rejects.toThrow("offline");
  expect(await graffiti.get(object, {}, session)).toEqual(object);
  await graffiti.flush(object.url, session);
  expect(put.mock.calls[1]).toEqual(put.mock.calls[0]);
  expect(await graffiti.localWrites.get(object.url)).toBeUndefined();
});

test("flush confirms one URL without waiting for later posts", async () => {
  const { graffiti, put } = client();
  const first = await graffiti.post({ value: { x: 1 }, channels: [] }, session);
  const upload = Promise.withResolvers<void>();
  put.mockImplementationOnce(() => upload.promise);
  const flushing = graffiti.flush(first.url, session);
  await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  const later = await graffiti.post({ value: { x: 2 }, channels: [] }, session);
  upload.resolve();
  await flushing;
  expect(put).toHaveBeenCalledTimes(1);
  await graffiti.flush(later.url, session);
  expect(put).toHaveBeenCalledTimes(2);
});

test("a delete accepted during upload runs after that upload", async () => {
  const { graffiti, put, remove } = client();
  const object = await graffiti.post({ value: {}, channels: [] }, session);
  const upload = Promise.withResolvers<void>();
  put.mockImplementationOnce(() => upload.promise);
  const flushing = graffiti.flush(object.url, session);
  await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  // Upload correctness must not depend on the discovery sequence surviving.
  await (await graffiti.localWrites.store).delete("clock");
  await graffiti.delete(object, session);
  await expect(graffiti.get(object, {}, session)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
  upload.resolve();
  await flushing;
  expect(remove).toHaveBeenCalledWith("https://test.invalid/bucket", put.mock.calls[0][1], "token");
  expect(put).toHaveBeenCalledTimes(1);
});

test("an object survives reopening and the configured grace period triggers upload", async () => {
  const { graffiti, put } = client(1000);
  const object = await graffiti.post({ value: { text: "hello" }, channels: [] }, session);
  const restored = client();
  expect(await restored.graffiti.get(object, {}, session)).toEqual(object);
  await vi.advanceTimersByTimeAsync(999);
  expect(put).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
});

test("background uploads stay bounded and include writes accepted during a pass", async () => {
  const { graffiti, put } = client(1000);
  const release = Promise.withResolvers<void>();
  let active = 0;
  let peak = 0;
  put.mockImplementation(async () => {
    peak = Math.max(peak, ++active);
    await release.promise;
    active--;
  });
  for (let n = 0; n < 6; n++) await graffiti.post({ value: { n }, channels: [] }, session);
  vi.advanceTimersByTime(1000);
  await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(4));
  await graffiti.post({ value: { n: 6 }, channels: [] }, session);
  await vi.advanceTimersByTimeAsync(2000);
  expect(put).toHaveBeenCalledTimes(4);
  release.resolve();
  await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(7));
  expect(peak).toBe(4);
});

test.each(["keys", "body"])("slow discovery %s do not block writes, and racing changes remain after its cursor", async stage => {
  const { graffiti } = client();
  const first = await graffiti.post({ value: { x: 1 }, channels: ["stream"] }, session);
  const cache = cacheStores("graffiti-outbox-v1");
  const match = cache.match.getMockImplementation()!;
  const reading = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let held = false;
  if (stage === "keys") {
    const keys = cache.keys.getMockImplementation()!;
    cache.keys.mockImplementation(async () => {
      held = true;
      reading.resolve();
      await release.promise;
      return keys();
    });
  }
  cache.match.mockImplementation(async key => {
    if (stage === "body" && !held && new URL(key).searchParams.get("key") === first.url) {
      held = true;
      reading.resolve();
      await release.promise;
    }
    return match(key);
  });
  const scanning = graffiti.localWrites.read();
  await reading.promise;
  let accepted = false;
  const posting = graffiti.post({ value: { x: 2 }, channels: ["stream"] }, session)
    .then(object => { accepted = true; return object; });
  try {
    await vi.waitFor(() => expect(accepted).toBe(true), { timeout: 1000 });
    await graffiti.delete(first, session);
  } finally {
    release.resolve();
  }
  const snapshot = await scanning;
  const second = await posting;
  expect(snapshot.writes.every(write => write.modified <= snapshot.clock)).toBe(true);
  const next = await graffiti.localWrites.read({ since: snapshot.clock });
  expect(new Map(next.writes.filter(write => write.modified > snapshot.clock)
    .map(write => [write.object.url, write.tombstone]))).toEqual(new Map([
      [first.url, true], [second.url, false],
    ]));
});

test("flushing a signaling URL does not read unrelated frame payloads", async () => {
  const { graffiti } = client();
  const frame = await graffiti.post({ value: { payload: "frame" }, channels: ["stream"] }, session);
  const signal = await graffiti.post({ value: { payload: "offer" }, channels: ["signaling"] }, session);
  const cache = cacheStores("graffiti-outbox-v1");
  cache.match.mockClear();
  await graffiti.flush(signal.url, session);
  expect(cache.match.mock.calls.some(([key]) => new URL(key).searchParams.get("key") === frame.url)).toBe(false);
});

test("scheduling preserves retry deadlines and discovery filters unrelated channels", async () => {
  const { graffiti, put } = client();
  const frame = await graffiti.post({ value: { payload: "frame" }, channels: ["stream"] }, session);
  expect(await graffiti.localWrites.pending()).toEqual([
    { url: frame.url, actor: session.actor, due: Date.now() + 60_000 },
  ]);
  expect((await page(graffiti.discover(["signaling"], {}, session))).entries).toEqual([]);
  put.mockRejectedValueOnce(new Error("offline"));
  await expect(graffiti.flush(frame.url, session)).rejects.toThrow("offline");
  expect((await graffiti.localWrites.pending())[0].due).toBe(Date.now() + 5000);
});

test("continued discovery and flushing do not reread deleted frame history", async () => {
  const { graffiti, put } = client();
  const history = new Set<string>();
  for (let frame = 0; frame < 30; frame++) {
    const object = await graffiti.post({ value: { frame, payload: "x".repeat(4000) }, channels: ["stream"] }, session);
    history.add(object.url);
    await graffiti.delete(object, session);
  }
  const initial = await page(graffiti.discover(["stream"], {}, session));
  expect(initial.entries).toEqual([]);
  const cache = cacheStores("graffiti-outbox-v1");
  cache.match.mockClear();
  cache.keys.mockClear();
  const current = await graffiti.post({ value: { frame: 30 }, channels: ["stream"] }, session);
  const updates = await page(graffiti.continueDiscover(initial.cursor, session));
  expect(updates.entries).toEqual([{ object: current }]);
  await graffiti.delete(current, session);
  const removed = await page(graffiti.continueDiscover(updates.cursor, session));
  expect(removed.entries).toEqual([{ object: current, tombstone: true }]);
  await graffiti.flush(current.url, session);
  expect(put).not.toHaveBeenCalled();
  expect(cache.match.mock.calls.some(([key]) => history.has(new URL(key).searchParams.get("key")!))).toBe(false);
  expect((await graffiti.localWrites.read()).writes).toEqual([]);
});

test("an index detects writes and deletions from another instance", async () => {
  const writer = client().graffiti;
  const reader = client().graffiti;
  const first = await writer.post({ value: { x: 1 }, channels: ["game"] }, session);
  const initial = await page(reader.discover(["game"], {}, session));
  expect(initial.entries).toEqual([{ object: first }]);
  const cache = cacheStores("graffiti-outbox-v1");
  cache.keys.mockClear();
  await writer.delete(first, session);
  const second = await writer.post({ value: { x: 2 }, channels: ["game"] }, session);
  const updates = await page(reader.continueDiscover(initial.cursor, session));
  expect(updates.entries).toHaveLength(2);
  expect(updates.entries).toEqual(expect.arrayContaining([
    { object: first, tombstone: true }, { object: second },
  ]));
  expect(cache.keys).not.toHaveBeenCalled();
  // The reader can also write between polls without advancing over its peer's
  // changes. Both changes must remain visible through the earlier cursor.
  const third = await writer.post({ value: { x: 3 }, channels: ["game"] }, session);
  const fourth = await reader.post({ value: { x: 4 }, channels: ["game"] }, session);
  const later = await page(reader.continueDiscover(updates.cursor, session));
  expect(later.entries).toEqual(expect.arrayContaining([{ object: third }, { object: fourth }]));
  expect(cache.keys).not.toHaveBeenCalled();
});

test("canceled frames leave an empty outbox and bounded history; older cursors expire", async () => {
  const writer = client().graffiti;
  const reader = client().graffiti;
  const first = await writer.post({ value: { x: 0 }, channels: ["game"] }, session);
  const initial = await page(reader.discover(["game"], {}, session));
  const unrelated = await page(reader.discover(["notes"], {}, session));
  await writer.delete(first, session);
  for (let x = 1; x <= 600; x++) {
    const object = await writer.post({ value: { x }, channels: ["unrelated"] }, session);
    await writer.delete(object, session);
  }
  expect((await writer.localWrites.read()).writes).toEqual([]);
  expect(cacheStores("graffiti-outbox-v1").entries.size).toBe(1); // clock only
  expect(cacheStores("graffiti-outbox-changes-v2").entries.size).toBeLessThanOrEqual(1024);
  await expect(page(reader.continueDiscover(initial.cursor, session))).rejects.toBeInstanceOf(GraffitiErrorCursorExpired);
  // The notes reader never saw pending frames. Its persistent cursor survives
  // the stream's short local history window, without clearing any inbox cache.
  expect((await page(reader.continueDiscover(unrelated.cursor, session))).entries).toEqual([]);
  const current = await writer.post({ value: { x: 601 }, channels: ["game"] }, session);
  expect((await page(reader.discover(["game"], {}, session))).entries).toEqual([{ object: current }]);
  const reopened = client().graffiti;
  expect((await page(reopened.discover(["game"], {}, session))).entries).toEqual([{ object: current }]);
});

test("a failed journal update cannot reject a durable write or hide it from other tabs", async () => {
  const writer = client().graffiti;
  const reader = client().graffiti;
  const initial = await page(reader.discover(["game"], {}, session));
  cacheStores("graffiti-outbox-changes-v2").put.mockRejectedValueOnce(new Error("journal unavailable"));
  const object = await writer.post({ value: { x: 1 }, channels: ["game"] }, session);
  expect(await reader.get(object, {}, session)).toEqual(object);
  expect((await page(reader.continueDiscover(initial.cursor, session))).entries).toEqual([{ object }]);
  expect((await page(reader.discover(["game"], {}, session))).entries).toEqual([{ object }]);
});

test("reading another tab's journal does not hold the write lock or skip a racing post", async () => {
  const writer = client().graffiti;
  const reader = client().graffiti;
  const first = await writer.post({ value: { x: 1 }, channels: ["game"] }, session);
  const initial = await reader.localWrites.read();
  await writer.delete(first, session);
  const journal = cacheStores("graffiti-outbox-changes-v2");
  const match = journal.match.getMockImplementation()!;
  const reading = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  journal.match.mockImplementationOnce(async key => {
    reading.resolve();
    await release.promise;
    return match(key);
  });
  const scanning = reader.localWrites.read({ since: initial.clock });
  await reading.promise;
  let accepted = false;
  const posting = writer.post({ value: { x: 2 }, channels: ["game"] }, session)
    .then(object => { accepted = true; return object; });
  try {
    await vi.waitFor(() => expect(accepted).toBe(true));
  } finally { release.resolve(); }
  const snapshot = await scanning;
  const second = await posting;
  expect(snapshot.writes.map(write => write.object.url)).toEqual([first.url]);
  const next = await reader.localWrites.read({ since: snapshot.clock });
  expect(next.writes.map(write => write.object.url)).toEqual([second.url]);
});

test("continuing an empty outbox still observes a later deletion", async () => {
  const { graffiti } = client();
  const initial = await page(graffiti.discover(["game"], {}, session));
  const object = await graffiti.post({ value: { x: 1 }, channels: ["game"] }, session);
  await graffiti.delete(object, session);
  const updates = await page(graffiti.continueDiscover(initial.cursor, session));
  expect(updates.entries).toEqual([{ object, tombstone: true }]);
});

test("waiting for the write lock does not consume the grace period", async () => {
  const { graffiti, put } = client(1000);
  const store = await graffiti.localWrites.store;
  const acquired = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const holding = store.lock(async () => { acquired.resolve(); await release.promise; });
  await acquired.promise;
  const queued = vi.spyOn(graffiti.localWrites, "put");
  const posting = graffiti.post({ value: { frame: 1 }, channels: ["stream"] }, session);
  try {
    await vi.waitFor(() => expect(queued).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(2000);
  } finally {
    release.resolve();
  }
  await holding;
  const object = await posting;
  expect((await graffiti.localWrites.get(object.url))!.due).toBe(Date.now() + 1000);
  await graffiti.delete(object, session);
  await vi.advanceTimersByTimeAsync(1000);
  expect(put).not.toHaveBeenCalled();
});

test("cache lock deadlines cancel queued work without stealing a held lock", async () => {
  const { graffiti } = client();
  const store = await graffiti.localWrites.store;
  const acquired = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const holding = store.lock(async () => { acquired.resolve(); await release.promise; });
  await acquired.promise;
  const work = vi.fn(async () => {});
  const waiting = store.lock(work);
  const rejected = expect(waiting).rejects.toThrow("Timed out waiting for another tab's Graffiti storage lock");
  await vi.advanceTimersByTimeAsync(30_000);
  try { await rejected; expect(work).not.toHaveBeenCalled(); }
  finally { release.resolve(); await holding; }
});

test("changing a discovery result cannot corrupt retained local changes", async () => {
  const { graffiti } = client();
  const initial = await page(graffiti.discover(["game"], {}, session));
  const object = await graffiti.post({ value: { x: 1 }, channels: ["game"] }, session);
  const first = await page(graffiti.continueDiscover(initial.cursor, session));
  const entry = first.entries[0];
  if (entry.error) throw entry.error;
  entry.object.value = { x: 99 };
  expect((await page(graffiti.continueDiscover(initial.cursor, session))).entries).toEqual([{ object }]);
});
