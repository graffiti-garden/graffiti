import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as fakeIndexedDB from "fake-indexeddb";
import { GraffitiErrorCursorExpired } from "@graffiti-garden/api";
import {
  createMessageStore,
  replayQuery,
  storeQueryPage,
  type MessageStore,
  type CacheQueryValue,
} from "./message-store";
import type { InboxMessageBase } from "../../1-services/4-inboxes";

const inboxUrl = "https://example.test/inbox";
const queryKey = "test-query";

function message(index: number): InboxMessageBase {
  return {
    id: `message-${index}`,
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

async function seed(store: MessageStore, count: number): Promise<CacheQueryValue> {
  return storeQueryPage(store, inboxUrl, queryKey, undefined, {
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
      const store = await createMessageStore();
      const query = await seed(store, 300);
      query.messageIds = ["message-299", ...query.messageIds, "message-128"];

      const result = await replayQuery(store, inboxUrl, queryKey, query, 1);
      expect(result.map((entry) => entry.id)).toEqual(query.messageIds.slice(1));
      expect(result[128]).not.toBe(result[300]);
      expect(await replayQuery(store, inboxUrl, queryKey, query, 302)).toEqual([]);
      expect(await replayQuery(store, inboxUrl, queryKey, query, 301)).toEqual([
        message(128),
      ]);
    });

    test("keeps queued reads ahead of later writes", async () => {
      const store = await createMessageStore();
      const query = await seed(store, 300);
      const firstReplay = replayQuery(store, inboxUrl, queryKey, query);
      const write = store.deleteMessage(inboxUrl, "message-299");
      expect((await firstReplay)[299]).toEqual(message(299));
      await write;
      await expect(replayQuery(store, inboxUrl, queryKey, query)).rejects.toBeInstanceOf(GraffitiErrorCursorExpired);
    });

    test.each(["indexeddb", "memory"])("mutating returned messages cannot change later replays (%s)", async storage => {
      if (storage === "memory") vi.stubGlobal("indexedDB", undefined);
      const store = await createMessageStore();
      const query = await seed(store, 129);
      const result = await replayQuery(store, inboxUrl, queryKey, query);
      result[128].m.m[0] = 99;
      result[128].m.o.value.index = -1;
      expect((await replayQuery(store, inboxUrl, queryKey, query))[128]).toEqual(
        message(128),
      );
    });

    test.each(["indexeddb", "memory"])("retains payloads independently of query histories and rejects changed bodies (%s)", async storage => {
      if (storage === "memory") vi.stubGlobal("indexedDB", undefined);
      const store = await createMessageStore();
      await seed(store, 1);
      const messageId = "message-0";
      // Expiring a query must not erase a message still referenced by Graffiti.
      await store.deleteQuery(queryKey);
      expect(await store.getMessage(inboxUrl, messageId)).toEqual(message(0));
      // Identical messages can be reused; changing their body is rejected.
      await store.setMessages(inboxUrl, [message(0)]);
      const changed = message(0);
      changed.m.o.value.index = -1;
      await expect(storeQueryPage(store, inboxUrl, queryKey, undefined, {
        messages: [changed], cursor: "changed-body", hasMore: false,
      })).rejects.toThrow("Inbox changed an existing announcement");
      expect(await store.getQuery(queryKey)).toBeUndefined();
      expect(await store.getMessage(inboxUrl, messageId)).toEqual(message(0));
    });

    test("invalidates a missing cached message", async () => {
      const store = await createMessageStore();
      const query = await seed(store, 129);
      const messageId = "message-128";
      await store.deleteMessage(inboxUrl, messageId);

      // Missing payloads invalidate their history rather than looking like
      // an empty result.
      await expect(replayQuery(store, inboxUrl, queryKey, query, 128))
        .rejects.toBeInstanceOf(GraffitiErrorCursorExpired);
      expect(await store.getQuery(queryKey)).toBeUndefined();
    });

    test("rejects read transaction aborts without partial results", async () => {
      const store = await createMessageStore();
      const query = await seed(store, 129);
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

      await expect(replayQuery(store, inboxUrl, queryKey, query)).rejects.toMatchObject({
        name: "AbortError",
      });
      expect(await store.getQuery(queryKey)).toEqual(query);
    });

    test("supports replay and missing records in the memory fallback", async () => {
      vi.stubGlobal("indexedDB", undefined);
      const store = await createMessageStore();
      const query = await seed(store, 300);
      const result = await replayQuery(store, inboxUrl, queryKey, query, 128);
      expect(result.map((entry) => entry.id)).toEqual(query.messageIds.slice(128));
      await store.deleteMessage(inboxUrl, "message-299");
      await expect(replayQuery(store, inboxUrl, queryKey, query)).rejects.toThrow(
        "Cache out of sync",
      );
      expect(await store.getQuery(queryKey)).toBeUndefined();
    });
  });
}
