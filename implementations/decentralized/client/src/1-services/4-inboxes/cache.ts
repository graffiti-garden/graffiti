import { encode as dagCborEncode } from "@ipld/dag-cbor";
import { LABELED_MESSAGE_ID_KEY, MESSAGE_LABEL_TRASH, type LabeledMessageBase } from "./messages";

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
  checkedAt?: number;
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

export class ReadInvalidated extends Error {}
type ReadVersion = { url: string; version: string | undefined };
const readVersionKey = (url: string) => `read-version:${encodeURIComponent(url)}`;

export type Cache = {
  messages: {
    get(k: string): Promise<LabeledMessageBase | null | undefined>;
    getMany(keys: string[]): Promise<(LabeledMessageBase | null | undefined)[]>;
    set(k: string, value: LabeledMessageBase | null): Promise<void>;
    setMany(entries: [string, LabeledMessageBase][]): Promise<void>;
    del(k: string): Promise<void>;
  };
  messageIds: {
    get(k: string): Promise<CacheQueryValue | undefined>;
    set(k: string, value: CacheQueryValue, read?: ReadVersion): Promise<boolean | void>;
    readVersion(url: string): Promise<string | undefined>;
    del(k: string): Promise<void>;
    invalidateReads(url: string): Promise<void>;
  };
};

export const readCachePrefix = (url: string) => `read:${encodeURIComponent(url)}:`;

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
  const messages = await cache.messages.getMany(
    messageIds.map((id) => getMessageCacheKey(inboxUrl, id)),
  );
  if (messages.some((message) => !message)) {
    // The query refers to messages that are no longer cached.
    try {
      await cache.messageIds.del(messageIdsCacheKey);
    } catch {}
    throw new Error("Cache out of sync - perhaps clear browser storage");
  }
  return messages as LabeledMessageBase[];
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
    checkedAt?: number;
    read?: ReadVersion;
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
    checkedAt: page.checkedAt,
  };
  // An earlier request must not refill the getter cache after a known deletion.
  if (await cache.messageIds.set(messageIdsCacheKey, query, page.read) === false) {
    throw new ReadInvalidated();
  }
  return query;
}

export async function getMessageIdsCacheKey(
  inboxUrl: string,
  type: "query" | "export",
  body?: Uint8Array,
  inboxToken?: string | null,
): Promise<string> {
  const cacheIdData = dagCborEncode({
    inboxUrl,
    type,
    body: body ?? null,
    inboxToken: inboxToken ?? null,
  });
  return crypto.subtle
    .digest("SHA-256", new Uint8Array(cacheIdData))
    .then((bytes) =>
      Array.from(new Uint8Array(bytes))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(""),
    );
}

// A response/validation started before deletion must not resurrect a message
// in another saved query. Message IDs are immutable, so keep its deletion label.
function preserveDeletion(previous: LabeledMessageBase | null | undefined, next: LabeledMessageBase | null) {
  return previous?.l === MESSAGE_LABEL_TRASH ? previous : next;
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
        getMany: async (keys) => {
          if (keys.length <= 1) {
            return Promise.all(keys.map((key) => db.get("m", key)));
          }

          const batches: Promise<(LabeledMessageBase | null | undefined)[]>[] = [];
          // Queue every read before awaiting, so later writes cannot overtake
          // part of this replay. Bounded transactions avoid both a transaction
          // per message and one very large transaction for the whole history.
          for (let start = 0; start < keys.length; start += 128) {
            const tx = db.transaction("m", "readonly");
            const reads = keys
              .slice(start, start + 128)
              .map((key) => tx.store.get(key));
            batches.push(
              Promise.all([Promise.all(reads), tx.done]).then(([values]) => values),
            );
          }
          return (await Promise.all(batches)).flat();
        },
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
          const tx = db.transaction("m", "readwrite");
          await tx.store.put(preserveDeletion(await tx.store.get(k), v), k);
          await tx.done;
        },
        setMany: async (entries) => {
          if (entries.length === 0) return;
          const tx = db.transaction("m", "readwrite");
          await Promise.all([
            ...entries.map(async ([k, v]) =>
              tx.store.put(preserveDeletion(await tx.store.get(k), v), k)),
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
        set: async (k, v, read) => {
          const tx = db.transaction("q", "readwrite");
          if (read && await tx.store.get(readVersionKey(read.url)) !== read.version) {
            await tx.done;
            return false;
          }
          await tx.store.put(v, k);
          await tx.done;
        },
        readVersion: (url) => db.get("q", readVersionKey(url)),
        del: (k) => db.delete("q", k),
        invalidateReads: async (url) => {
          const prefix = readCachePrefix(url);
          const tx = db.transaction("q", "readwrite");
          await tx.store.delete(IDBKeyRange.bound(prefix, prefix + "\uffff"));
          await tx.store.put(crypto.randomUUID(), readVersionKey(url));
          await tx.done;
        },
      },
    };
  }

  const m = new Map<string, LabeledMessageBase | null>();
  const q = new Map<string, CacheQueryValue>();
  const readVersions = new Map<string, string>();

  return {
    messages: {
      getMany: async (keys) => keys.map((key) => m.get(key)),
      get: async (k) => m.get(k),
      set: async (k, v) => void m.set(k, preserveDeletion(m.get(k), v)),
      setMany: async (entries) => {
        for (const [k, v] of entries) m.set(k, preserveDeletion(m.get(k), v));
      },
      del: async (k) => void m.delete(k),
    },
    messageIds: {
      get: async (k) => q.get(k),
      set: async (k, v, read) => {
        if (read && readVersions.get(read.url) !== read.version) return false;
        q.set(k, v);
      },
      readVersion: async (url) => readVersions.get(url),
      del: async (k) => void q.delete(k),
      invalidateReads: async (url) => {
        const prefix = readCachePrefix(url);
        for (const key of q.keys()) if (key.startsWith(prefix)) q.delete(key);
        readVersions.set(url, crypto.randomUUID());
      },
    },
  };
}
