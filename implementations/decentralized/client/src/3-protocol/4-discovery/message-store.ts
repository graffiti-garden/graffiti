import { encode as dagCborEncode } from "@ipld/dag-cbor";
import { GraffitiErrorCursorExpired } from "@graffiti-garden/api";
import { INBOX_MESSAGE_ID_KEY, type InboxMessageBase } from "../../1-services/4-inboxes";

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

// Callers use announcement identities; message key encoding and tables stay private.
export type MessageStore = {
  getMessage(inboxUrl: string, messageId: string): Promise<InboxMessageBase | undefined>;
  getMessages(inboxUrl: string, messageIds: string[]): Promise<(InboxMessageBase | undefined)[]>;
  setMessages(inboxUrl: string, messages: InboxMessageBase[]): Promise<void>;
  deleteMessage(inboxUrl: string, messageId: string): Promise<void>;
  getQuery(key: string): Promise<CacheQueryValue | undefined>;
  setQuery(key: string, query: CacheQueryValue): Promise<void>;
  deleteQuery(key: string): Promise<void>;
};

function getMessageCacheKey(inboxUrl: string, messageId: string) {
  return `${encodeURIComponent(inboxUrl)}:${encodeURIComponent(messageId)}`;
}

export async function replayQuery(
  store: MessageStore,
  inboxUrl: string,
  messageIdsCacheKey: string,
  query: CacheQueryValue,
  numSeen = 0,
): Promise<InboxMessageBase[]> {
  const messages = await store.getMessages(
    inboxUrl,
    query.messageIds.slice(numSeen),
  );
  if (messages.some((message) => !message)) {
    // The query refers to messages that are no longer cached.
    try {
      await store.deleteQuery(messageIdsCacheKey);
    } catch {}
    throw new GraffitiErrorCursorExpired("Cache out of sync - restart discovery");
  }
  return messages as InboxMessageBase[];
}

export async function storeQueryPage(
  store: MessageStore,
  inboxUrl: string,
  messageIdsCacheKey: string,
  previous: CacheQueryValue | undefined,
  page: {
    messages: InboxMessageBase[];
    cursor: string;
    hasMore: boolean;
    waitTil?: number;
  },
): Promise<CacheQueryValue> {
  // Cache the bodies before advancing the query.
  await store.setMessages(inboxUrl, page.messages);
  // Then store all the messageids
  const query = {
    cursor: page.cursor,
    version: previous?.version ?? crypto.randomUUID(),
    messageIds: [
      ...(previous?.messageIds ?? []),
      ...page.messages.map((message) => message[INBOX_MESSAGE_ID_KEY]),
    ],
    generation: crypto.randomUUID(),
    hasMore: page.hasMore,
    waitTil: page.waitTil,
  };
  await store.setQuery(messageIdsCacheKey, query);
  return query;
}

// Announcement bodies are immutable. Keep a retained payload available even
// if another query supplies a conflicting copy.
function checkPayload(previous: InboxMessageBase | undefined, next: InboxMessageBase): void {
  if (!previous || !next) return;
  const original = dagCborEncode(previous.m);
  const received = dagCborEncode(next.m);
  if (previous.id !== next.id || original.length !== received.length || !original.every((byte, i) => byte === received[i])) {
    throw new Error("Inbox changed an existing announcement");
  }
}

async function resetCacheDB() {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("graffiti-inbox-cache-v2");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve(); // best effort
    req.onblocked = () => resolve(); // best effort
  });
}

export async function createMessageStore(): Promise<MessageStore> {
  if (await canUseIDB()) {
    const { openDB } = await import("idb");
    // Start fresh for the label-free wire format. Old histories and negative
    // message lookups cannot be reused by the new protocol.
    const db = await openDB("graffiti-inbox-cache-v2", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("m")) db.createObjectStore("m");
        if (!db.objectStoreNames.contains("q")) db.createObjectStore("q");
      },
    });

    return {
      getMessages: async (inboxUrl, messageIds) => {
        const keys = messageIds.map(id => getMessageCacheKey(inboxUrl, id));
        if (keys.length <= 1) {
          return Promise.all(keys.map((key) => db.get("m", key)));
        }

        const batches: Promise<(InboxMessageBase | undefined)[]>[] = [];
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
      getMessage: async (inboxUrl, messageId) => {
        try {
          return db.get("m", getMessageCacheKey(inboxUrl, messageId));
        } catch (error) {
          console.error("Error getting message from cache:", error);
          console.error("resetting cache...");
          await resetCacheDB();
          return undefined;
        }
      },
      setMessages: async (inboxUrl, messages) => {
        if (messages.length === 0) return;
        const tx = db.transaction("m", "readwrite");
        await Promise.all([
          ...messages.map(async (message) => {
            const key = getMessageCacheKey(inboxUrl, message.id);
            checkPayload(await tx.store.get(key), message);
            await tx.store.put(message, key);
          }),
          tx.done,
        ]);
      },
      deleteMessage: (inboxUrl, messageId) => db.delete("m", getMessageCacheKey(inboxUrl, messageId)),
      getQuery: async (key) => {
        try {
          return await db.get("q", key);
        } catch (error) {
          console.error("Error getting message IDs from cache:", error);
          console.error("resetting cache...");
          await resetCacheDB();
          return undefined;
        }
      },
      setQuery: (key, query) => db.put("q", query, key).then(() => {}),
      deleteQuery: (key) => db.delete("q", key),
    };
  }

  const m = new Map<string, InboxMessageBase>();
  const q = new Map<string, CacheQueryValue>();

  return {
    getMessages: async (inboxUrl, messageIds) => messageIds.map(id =>
      structuredClone(m.get(getMessageCacheKey(inboxUrl, id)))),
    getMessage: async (inboxUrl, messageId) => structuredClone(m.get(getMessageCacheKey(inboxUrl, messageId))),
    setMessages: async (inboxUrl, messages) => {
      for (const message of messages) checkPayload(m.get(getMessageCacheKey(inboxUrl, message.id)), message);
      for (const message of messages) m.set(getMessageCacheKey(inboxUrl, message.id), structuredClone(message));
    },
    deleteMessage: async (inboxUrl, messageId) => void m.delete(getMessageCacheKey(inboxUrl, messageId)),
    getQuery: async (key) => structuredClone(q.get(key)),
    setQuery: async (key, query) => void q.set(key, structuredClone(query)),
    deleteQuery: async (key) => void q.delete(key),
  };
}
