import { encode as dagCborEncode } from "@ipld/dag-cbor";
import { LABELED_MESSAGE_ID_KEY, type LabeledMessageBase } from "./messages";

// One record per inbox query. Messages live in the separate message cache;
// this record tracks their IDs and where to continue fetching from the server.
export type CacheQueryValue = {
  // Server continuation state for the next page.
  cursor: string;
  // Identifies this local query history, not a server version. It stays the
  // same as pages arrive; a reset creates a new one so old caller cursors expire.
  version: string;
  // All message IDs fetched for this query so far, in order. A caller's
  // numSeen cursor indexes into this list to replay only unseen messages.
  messageIds: string[];
  waitTil?: number;
  // Changes on every cached page write, even if the page is empty and neither
  // messageIds nor cursor changes. A tab waiting on the query lock can use this
  // to detect and reuse a page fetched by another tab. Older entries lack it.
  generation?: string;
  // Whether the server has another page; needed when reusing another tab's
  // cached page. Older cache entries lack this and are refreshed on next query.
  hasMore?: boolean;
};

export async function canUseIDB(): Promise<boolean> {
  try {
    if (!globalThis.indexedDB) return false;

    // Small probe database
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("__idb_probe__", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("k");
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });

    return true;
  } catch {
    return false;
  }
}

export type Cache = {
  messages: {
    get(k: string): Promise<LabeledMessageBase | null | undefined>;
    set(k: string, value: LabeledMessageBase | null): Promise<void>;
    setMany(entries: [string, LabeledMessageBase][]): Promise<void>;
    del(k: string): Promise<void>;
  };
  messageIds: {
    get(k: string): Promise<CacheQueryValue | undefined>;
    set(k: string, value: CacheQueryValue): Promise<void>;
    del(k: string): Promise<void>;
  };
};

export function getMessageCacheKey(inboxUrl: string, messageId: string) {
  return `${encodeURIComponent(inboxUrl)}:${encodeURIComponent(messageId)}`;
}

export async function replayQuery(
  cache: Cache,
  inboxUrl: string,
  messageIdsCacheKey: string,
  query: CacheQueryValue,
  numSeen = 0,
): Promise<LabeledMessageBase[]> {
  // Filter out all messageIds before
  // the number already seen
  const messageIds = query.messageIds.slice(numSeen);

  // Get all the messages pointed to in the cache
  return Promise.all(
    messageIds.map(async (id) => {
      const message = await cache.messages.get(getMessageCacheKey(inboxUrl, id));
      if (!message) {
        // Something is very wrong with the cache,
        // it refers to message IDs that are not cached
        try {
          await cache.messageIds.del(messageIdsCacheKey);
        } catch {}
        throw new Error("Cache out of sync - perhaps clear browser storage");
      }
      return message;
    }),
  );
}

export async function storeQueryPage(
  cache: Cache,
  inboxUrl: string,
  messageIdsCacheKey: string,
  previous: CacheQueryValue | undefined,
  page: {
    messages: LabeledMessageBase[];
    cursor: string;
    hasMore: boolean;
    waitTil?: number;
  },
): Promise<CacheQueryValue> {
  // First cache the messages with their labels
  await cache.messages.setMany(
    page.messages.map((message) => [
      getMessageCacheKey(inboxUrl, message[LABELED_MESSAGE_ID_KEY]),
      message,
    ]),
  );
  // Then store all the messageids
  const query = {
    cursor: page.cursor,
    version: previous?.version ?? crypto.randomUUID(),
    messageIds: [
      ...(previous?.messageIds ?? []),
      ...page.messages.map((message) => message[LABELED_MESSAGE_ID_KEY]),
    ],
    generation: crypto.randomUUID(),
    hasMore: page.hasMore,
    waitTil: page.waitTil,
  };
  await cache.messageIds.set(messageIdsCacheKey, query);
  return query;
}

export async function getMessageIdsCacheKey(
  inboxUrl: string,
  type: "query" | "export",
  body?: Uint8Array,
): Promise<string> {
  const cacheIdData = dagCborEncode({
    inboxUrl,
    type,
    body: body ?? null,
  });
  return crypto.subtle
    .digest("SHA-256", new Uint8Array(cacheIdData))
    .then((bytes) =>
      Array.from(new Uint8Array(bytes))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(""),
    );
}

async function resetCacheDB() {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("graffiti-inbox-cache");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve(); // best effort
    req.onblocked = () => resolve(); // best effort
  });
}

export async function createCache(): Promise<Cache> {
  if (await canUseIDB()) {
    const { openDB } = await import("idb");
    const db = await openDB("graffiti-inbox-cache", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("m")) db.createObjectStore("m");
        if (!db.objectStoreNames.contains("q")) db.createObjectStore("q");
      },
    });

    return {
      messages: {
        get: async (k) => {
          try {
            return db.get("m", k);
          } catch (error) {
            console.error("Error getting message from cache:", error);
            console.error("resetting cache...");
            await resetCacheDB();
            return undefined;
          }
        },
        set: async (k, v) => {
          await db.put("m", v, k);
        },
        setMany: async (entries) => {
          if (entries.length === 0) return;
          const tx = db.transaction("m", "readwrite");
          await Promise.all([
            ...entries.map(([k, v]) => tx.store.put(v, k)),
            tx.done,
          ]);
        },
        del: (k) => db.delete("m", k),
      },
      messageIds: {
        get: async (k) => {
          try {
            return await db.get("q", k);
          } catch (error) {
            console.error("Error getting message IDs from cache:", error);
            console.error("resetting cache...");
            await resetCacheDB();
            return undefined;
          }
        },
        set: async (k, v) => {
          await db.put("q", v, k);
        },
        del: (k) => db.delete("q", k),
      },
    };
  }

  const m = new Map<string, LabeledMessageBase | null>();
  const q = new Map<string, CacheQueryValue>();

  return {
    messages: {
      get: async (k) => m.get(k),
      set: async (k, v) => void m.set(k, v),
      setMany: async (entries) => {
        for (const [k, v] of entries) m.set(k, v);
      },
      del: async (k) => void m.delete(k),
    },
    messageIds: {
      get: async (k) => q.get(k),
      set: async (k, v) => void q.set(k, v),
      del: async (k) => void q.delete(k),
    },
  };
}
