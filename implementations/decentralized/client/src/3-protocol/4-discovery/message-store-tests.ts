import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mockCacheStorage } from "./cache-tests";
import { GraffitiErrorCursorExpired } from "@graffiti-garden/api";
import {
  createMessageStore,
  replayQuery,
  storeQueryPage,
  type MessageStore,
  type CacheQueryValue,
} from "./message-store";
import { PINNED_BY_ME, type LabeledMessageBase } from "../../1-services/4-inboxes";

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

async function seed(store: MessageStore, count: number): Promise<CacheQueryValue> {
  return storeQueryPage(store, inboxUrl, queryKey, undefined, {
    messages: Array.from({ length: count }, (_, index) => message(index)),
    cursor: "server-cursor",
    hasMore: false,
  });
}

export function inboxCacheTests() {
  describe("Inbox cache replay", () => {
    let caches: ReturnType<typeof mockCacheStorage>;
    beforeEach(() => {
      caches = mockCacheStorage();
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
      const updated = message(299);
      updated.l = 2;
      const write = store.setMessage(inboxUrl, updated.id, updated);

      expect((await firstReplay)[299].l).toBe(1);
      await write;
      expect((await replayQuery(store, inboxUrl, queryKey, query))[299].l).toBe(2);
    });

    test("does not retain account-specific pin state in the shared message cache", async () => {
      const store = await createMessageStore();
      const original = message(0);
      const pinned = { ...original, [PINNED_BY_ME]: true };
      const query = await storeQueryPage(store, inboxUrl, queryKey, undefined, {
        messages: [pinned], cursor: "server-cursor", hasMore: false,
      });
      // Another account can replay these bodies, but must not inherit this pin.
      expect(await replayQuery(store, inboxUrl, queryKey, query)).toEqual([original]);
      expect(pinned[PINNED_BY_ME]).toBe(true);
      await store.setMessage(inboxUrl, original.id, { ...original, [PINNED_BY_ME]: false });
      expect(await store.getMessage(inboxUrl, original.id)).toEqual(original);
    });

    test.each(["cache", "memory"])("mutating returned messages cannot change later replays (%s)", async storage => {
      if (storage === "memory") vi.stubGlobal("caches", undefined);
      const store = await createMessageStore();
      const query = await seed(store, 129);
      const result = await replayQuery(store, inboxUrl, queryKey, query);
      result[128].m.m[0] = 99;
      result[128].m.o.value.index = -1;
      expect((await replayQuery(store, inboxUrl, queryKey, query))[128]).toEqual(
        message(128),
      );
    });

    test.each(["cache", "memory"])("retains payloads independently of query histories and rejects changed bodies (%s)", async storage => {
      if (storage === "memory") vi.stubGlobal("caches", undefined);
      const store = await createMessageStore();
      await seed(store, 1);
      const messageId = "message-0";
      // Expiring a query must not erase a message still referenced by Graffiti.
      await store.deleteQuery(queryKey);
      expect(await store.getMessage(inboxUrl, messageId)).toEqual(message(0));
      // Labels are mutable server metadata; the announcement body is immutable.
      const relabeled = { ...message(0), l: 42 };
      await store.setMessages(inboxUrl, [relabeled]);
      expect(await store.getMessage(inboxUrl, messageId)).toEqual(relabeled);
      const changed = message(0);
      changed.m.o.value.index = -1;
      await expect(storeQueryPage(store, inboxUrl, queryKey, undefined, {
        messages: [changed], cursor: "changed-body", hasMore: false,
      })).rejects.toThrow("Inbox changed an existing announcement");
      expect(await store.getQuery(queryKey)).toBeUndefined();
      expect(await store.getMessage(inboxUrl, messageId)).toEqual(relabeled);
    });

    test.each(["deleted", "null"])("invalidates a %s cached message", async (kind) => {
      const store = await createMessageStore();
      const query = await seed(store, 129);
      const messageId = "message-128";
      if (kind === "deleted") await store.deleteMessage(inboxUrl, messageId);
      else await store.setMessage(inboxUrl, messageId, null);

      // Missing payloads invalidate their history rather than looking like
      // an empty result.
      await expect(replayQuery(store, inboxUrl, queryKey, query, 128))
        .rejects.toBeInstanceOf(GraffitiErrorCursorExpired);
      expect(await store.getQuery(queryKey)).toBeUndefined();
    });

    test("rejects failed reads without partial results", async () => {
      const store = await createMessageStore();
      const query = await seed(store, 129);
      caches("graffiti-inbox-messages-v1").match.mockRejectedValueOnce(new DOMException("Read failed", "AbortError"));

      await expect(replayQuery(store, inboxUrl, queryKey, query)).rejects.toMatchObject({
        name: "AbortError",
      });
      expect(await store.getQuery(queryKey)).toEqual(query);
    });

    test("keeps the previous cursor when only part of a page can be saved", async () => {
      const store = await createMessageStore();
      const previous = await seed(store, 1);
      const page = { messages: [message(1), message(2)], cursor: "next-page", hasMore: false };
      caches("graffiti-inbox-messages-v1").put.mockRejectedValueOnce(
        new DOMException("Cache full", "QuotaExceededError"),
      );

      await expect(storeQueryPage(store, inboxUrl, queryKey, previous, page))
        .rejects.toMatchObject({ name: "QuotaExceededError" });
      expect(await store.getQuery(queryKey)).toEqual(previous);
      // The other write finished before releasing the lock. Retrying the
      // same page must safely reuse it and then advance the query.
      expect(await store.getMessage(inboxUrl, "message-2")).toEqual(message(2));
      const retried = await storeQueryPage(store, inboxUrl, queryKey, previous, page);
      expect(await replayQuery(store, inboxUrl, queryKey, retried)).toEqual([
        message(0), message(1), message(2),
      ]);
      expect((await store.getQuery(queryKey))?.cursor).toBe("next-page");
    });

    test("supports replay and missing records in the memory fallback", async () => {
      vi.stubGlobal("caches", undefined);
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
