import { encode as dagCborEncode } from "@ipld/dag-cbor";
import { GraffitiErrorCursorExpired } from "@graffiti-garden/api";
import { LABELED_MESSAGE_ID_KEY, type LabeledMessageBase } from "../../1-services/4-inboxes";
import { cacheBatch, createCache } from "./cache";

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

// Callers use announcement identities; message key encoding and tables stay private.
export type MessageStore = {
  shared: boolean;
  getMessage(inboxUrl: string, messageId: string): Promise<LabeledMessageBase | null | undefined>;
  getMessages(inboxUrl: string, messageIds: string[]): Promise<(LabeledMessageBase | null | undefined)[]>;
  setMessage(inboxUrl: string, messageId: string, message: LabeledMessageBase | null): Promise<void>;
  setMessages(inboxUrl: string, messages: LabeledMessageBase[]): Promise<void>;
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
): Promise<LabeledMessageBase[]> {
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
  return messages as LabeledMessageBase[];
}

export async function storeQueryPage(
  store: MessageStore,
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
  // Save every message before advancing the query. Cache API writes are
  // atomic per entry, not per page; a partial failure must leave it retryable.
  await store.setMessages(inboxUrl, page.messages);
  const query: CacheQueryValue = {
    cursor: page.cursor,
    version: previous?.version ?? crypto.randomUUID(),
    messageIds: [
      ...(previous?.messageIds ?? []),
      ...page.messages.map((message) => message[LABELED_MESSAGE_ID_KEY]),
    ],
    generation: crypto.randomUUID(),
    hasMore: page.hasMore,
  };
  // DAG-CBOR does not encode undefined, so omit an absent delay.
  if (page.waitTil !== undefined) query.waitTil = page.waitTil;
  await store.setQuery(messageIdsCacheKey, query);
  return query;
}

// Labels may change; the body of an announcement must not. Keep a retained
// payload available even if another query supplies a conflicting copy.
function checkPayload(previous: LabeledMessageBase | null | undefined, next: LabeledMessageBase | null): void {
  if (!previous || !next) return;
  const original = dagCborEncode(previous.m);
  const received = dagCborEncode(next.m);
  if (previous.id !== next.id || original.length !== received.length || !original.every((byte, i) => byte === received[i])) {
    throw new Error("Inbox changed an existing announcement");
  }
}

export async function createMessageStore(): Promise<MessageStore> {
  const messages = await createCache<LabeledMessageBase | null>("graffiti-inbox-messages-v1");
  const queries = await createCache<CacheQueryValue>("graffiti-inbox-queries-v1");

  function write(entries: { key: string; value: LabeledMessageBase | null }[]) {
    return messages.lock(async () => {
      const previous = await cacheBatch(entries, entry => messages.get(entry.key));
      // Check the whole page before replacing any retained payloads.
      entries.forEach((entry, i) => checkPayload(previous[i], entry.value));
      await cacheBatch(entries, entry => messages.set(entry.key, entry.value));
    });
  }

  return {
    shared: messages.shared && queries.shared,
    getMessages: (inboxUrl, messageIds) => messages.lock(() =>
      cacheBatch(messageIds, id => messages.get(getMessageCacheKey(inboxUrl, id))), "shared"),
    getMessage: (inboxUrl, messageId) => messages.get(getMessageCacheKey(inboxUrl, messageId)),
    setMessage: (inboxUrl, messageId, message) => write([{ key: getMessageCacheKey(inboxUrl, messageId), value: message }]),
    setMessages: async (inboxUrl, entries) => {
      if (entries.length) await write(entries.map(value => ({ key: getMessageCacheKey(inboxUrl, value.id), value })));
    },
    deleteMessage: (inboxUrl, messageId) => messages.lock(() => messages.delete(getMessageCacheKey(inboxUrl, messageId))),
    getQuery: key => queries.get(key),
    setQuery: (key, query) => queries.set(key, query),
    deleteQuery: key => queries.delete(key),
  };
}
