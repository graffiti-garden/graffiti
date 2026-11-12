import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as fakeIndexedDB from "fake-indexeddb";
import {
  createCache,
  getMessageCacheKey,
  replayQuery,
  storeQueryPage,
  type Cache,
  type CacheQueryValue,
} from "./cache";
import type { LabeledMessageBase } from "./messages";

const inboxUrl = "https://example.test/inbox";
const queryKey = "test-query";

function message(index: number): LabeledMessageBase {
  return {
    id: `message-${index}`,
    l: 1,
    m: {
      t: [new Uint8Array([index % 256])],
      m: new Uint8Array([1, 2, 3]),
      o: {
        url: `https://example.test/object/${index}`,
        actor: "did:example:test",
        channels: ["test"],
        value: { index },
      },
    },
  };
}

async function seed(cache: Cache, count: number): Promise<CacheQueryValue> {
  return storeQueryPage(cache, inboxUrl, queryKey, undefined, {
    messages: Array.from({ length: count }, (_, index) => message(index)),
    cursor: "server-cursor",
    hasMore: false,
  });
}

export function inboxCacheTests() {
  describe("Inbox cache replay", () => {
    beforeEach(() => {
      for (const [name, value] of Object.entries(fakeIndexedDB)) {
        if (name.startsWith("IDB")) vi.stubGlobal(name, value);
      }
      vi.stubGlobal("indexedDB", new fakeIndexedDB.IDBFactory());
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    test("preserves order, duplicate IDs and continuation offsets", async () => {
      const cache = await createCache();
      const query = await seed(cache, 300);
      query.messageIds = ["message-299", ...query.messageIds, "message-128"];

      const result = await replayQuery(cache, inboxUrl, queryKey, query, 1);
      expect(result.map((entry) => entry.id)).toEqual(query.messageIds.slice(1));
      expect(result[128]).not.toBe(result[300]);
      expect(await replayQuery(cache, inboxUrl, queryKey, query, 302)).toEqual([]);
      expect(await replayQuery(cache, inboxUrl, queryKey, query, 301)).toEqual([
        message(128),
      ]);
    });

    test("keeps queued reads ahead of later writes", async () => {
      const cache = await createCache();
      const query = await seed(cache, 300);
      const firstReplay = replayQuery(cache, inboxUrl, queryKey, query);
      const updated = message(299);
      updated.l = 2;
      const write = cache.messages.set(getMessageCacheKey(inboxUrl, updated.id), updated);

      expect((await firstReplay)[299].l).toBe(1);
      await write;
      expect((await replayQuery(cache, inboxUrl, queryKey, query))[299].l).toBe(2);
    });

    test("mutating returned messages cannot change later IndexedDB replays", async () => {
      const cache = await createCache();
      const query = await seed(cache, 129);
      const result = await replayQuery(cache, inboxUrl, queryKey, query);
      result[128].m.m[0] = 99;
      result[128].m.o.value.index = -1;
      expect((await replayQuery(cache, inboxUrl, queryKey, query))[128]).toEqual(
        message(128),
      );
    });

    test.each(["deleted", "null"])("invalidates a %s cached message", async (kind) => {
      const cache = await createCache();
      const query = await seed(cache, 129);
      const key = getMessageCacheKey(inboxUrl, "message-128");
      if (kind === "deleted") await cache.messages.del(key);
      else await cache.messages.set(key, null);

      await expect(replayQuery(cache, inboxUrl, queryKey, query)).rejects.toThrow(
        "Cache out of sync",
      );
      expect(await cache.messageIds.get(queryKey)).toBeUndefined();
    });

    test("rejects read transaction aborts without partial results", async () => {
      const cache = await createCache();
      const query = await seed(cache, 129);
      const original = IDBDatabase.prototype.transaction;
      let aborted = false;
      vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(function (
        this: IDBDatabase,
        ...args: Parameters<IDBDatabase["transaction"]>
      ) {
        const tx = original.apply(this, args);
        if (!aborted && args[0] === "m" && args[1] === "readonly") {
          aborted = true;
          queueMicrotask(() => tx.abort());
        }
        return tx;
      });

      await expect(replayQuery(cache, inboxUrl, queryKey, query)).rejects.toMatchObject({
        name: "AbortError",
      });
      expect(await cache.messageIds.get(queryKey)).toEqual(query);
    });

    test("supports replay and missing records in the memory fallback", async () => {
      vi.stubGlobal("indexedDB", undefined);
      const cache = await createCache();
      const query = await seed(cache, 300);
      const result = await replayQuery(cache, inboxUrl, queryKey, query, 128);
      expect(result.map((entry) => entry.id)).toEqual(query.messageIds.slice(128));
      await cache.messages.del(getMessageCacheKey(inboxUrl, "message-299"));
      await expect(replayQuery(cache, inboxUrl, queryKey, query)).rejects.toThrow(
        "Cache out of sync",
      );
      expect(await cache.messageIds.get(queryKey)).toBeUndefined();
    });
  });
}
