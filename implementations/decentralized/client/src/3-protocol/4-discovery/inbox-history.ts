import type { JSONSchema } from "@graffiti-garden/api";
import { verifyHTTPSEndpoint } from "../../1-services/utilities";
import { Inboxes } from "../../1-services/4-inboxes";
import {
  compileGraffitiObjectSchema,
  GraffitiErrorCursorExpired,
} from "@graffiti-garden/api";
import { encode as dagCborEncode } from "@ipld/dag-cbor";
import {
  type infer as infer_,
  string,
  strictObject,
  looseObject,
  nonnegative,
  int,
  boolean,
  union,
} from "zod/mini";
import {
  LABELED_MESSAGE_MESSAGE_KEY,
  MESSAGE_OBJECT_KEY,
} from "../../1-services/4-inboxes";
import type {
  LabeledMessageBase,
  LabeledMessage,
  Message,
} from "../../1-services/4-inboxes";
import {
  canUseIDB,
  createCache,
  getMessageCacheKey,
  getMessageIdsCacheKey,
  replayQuery,
  storeQueryPage,
  readCachePrefix,
  ReadInvalidated,
} from "./message-store";
import type { Cache, CacheQueryValue } from "./message-store";

// A stalled tab should not make peers wait indefinitely. This only bounds
// lock acquisition; the request above bounds work after acquisition.
const INBOX_LOCK_WAIT_TIMEOUT_MS = 30_000;

export interface InboxReadOptions {
  refresh?: boolean;
  // Getter histories are keyed separately so deleting one does not expire
  // discovery cursors. This also guards against stale in-flight getter writes.
  url?: string;
}

type StreamSource<Schema extends JSONSchema> = { options?: InboxReadOptions } & (
  | {
      kind: "query";
      inboxUrl: string;
      tags: Uint8Array[];
      schema: Schema;
      inboxToken?: string | null;
    }
  | {
      kind: "continue";
      inboxUrl: string;
      cursor: infer_<typeof CursorSchema>;
      inboxToken?: string | null;
    }
  | {
      kind: "export";
      inboxUrl: string;
      inboxToken: string;
    });

export class InboxHistory {
  constructor(
    protected readonly http = new Inboxes(),
    private readonly openStore: () => Promise<Cache> = createCache,
  ) {}
  protected cache_: Promise<Cache> | null = null;
  protected get cache() {
    if (!this.cache_) {
      this.cache_ = this.openStore();
    }
    return this.cache_;
  }

  async invalidateReads(url: string): Promise<void> {
    await (await this.cache).messageIds.invalidateReads(url);
  }

  send(inboxUrl: string, message: Message<{}>): Promise<string> {
    return this.http.send(inboxUrl, message);
  }

  async get(
    inboxUrl: string,
    messageId: string,
    inboxToken?: string | null,
  ): Promise<LabeledMessageBase | null> {
    const messageCacheKey = getMessageCacheKey(inboxUrl, messageId);
    const cache = await this.cache;
    const cached = await cache.messages.get(messageCacheKey);
    if (cached !== undefined) return cached;

    const message = await this.http.get(inboxUrl, messageId, inboxToken);
    await cache.messages.set(messageCacheKey, message);
    return message;
  }

  async label(
    inboxUrl: string,
    messageId: string,
    label: number,
    inboxToken?: string | null,
  ): Promise<void> {
    await this.http.label(inboxUrl, messageId, label, inboxToken);
    await this.cacheLabel(inboxUrl, messageId, label);
  }

  // A verified local result need not wait for advisory server labeling.
  async cacheLabel(inboxUrl: string, messageId: string, label: number): Promise<void> {
    const cache = await this.cache;
    const messageCacheKey = getMessageCacheKey(inboxUrl, messageId);
    const result = await cache.messages.get(messageCacheKey);
    if (result) {
      await cache.messages.set(messageCacheKey, {
        ...result,
        l: label,
      });
    }
  }

  protected async withQueryLock<T>(
    messageIdsCacheKey: string,
    useLock: boolean,
    work: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (!useLock) return work();

    // The lock follows one page of network and cache work; yielding cannot
    // prolong it.
    const timeout = AbortSignal.timeout(INBOX_LOCK_WAIT_TIMEOUT_MS);
    let acquired = false;
    try {
      return await window.navigator.locks.request(
        `graffiti:inbox:${messageIdsCacheKey}`,
        {
          mode: "exclusive",
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        },
        async () => {
          acquired = true;
          return work();
        },
      );
    } catch (error) {
      if (!acquired && timeout.aborted) {
        throw new Error("Timed out waiting for another tab's inbox query", {
          cause: error,
        });
      }
      throw error;
    }
  }

  protected async *messageStreamer<Schema extends JSONSchema>(
    source: StreamSource<Schema>,
  ): MessageStream<Schema> {
    const { inboxUrl, inboxToken } = source;
    const type = source.kind === "export" ? "export" : "query";
    // Continuations carry their validated schema in the cursor; export uses
    // the empty schema. Both callers instantiate this stream with Schema = {}.
    const objectSchema = (
      source.kind === "query"
        ? source.schema
        : source.kind === "continue" ? source.cursor.objectSchema : {}
    ) as Schema;
    const validator = await compileGraffitiObjectSchema(objectSchema);
    const body = source.kind === "query"
      ? new Uint8Array(dagCborEncode({ tags: source.tags, schema: source.schema }))
      : undefined;
    const readUrl = source.options?.url;
    const refresh = source.options?.refresh !== false;
    const messageIdsCacheKey = source.kind === "continue"
      ? source.cursor.messageIdsCacheKey
      : (readUrl ? readCachePrefix(readUrl) : "") +
        await getMessageIdsCacheKey(inboxUrl, type, body, inboxToken);
    const cacheVersion = source.kind === "continue"
      ? source.cursor.version
      : undefined;
    // Opening IndexedDB can wait on another tab, so do it before holding a lock.
    const cache = await this.cache;
    // TODO: implement locking in node as well, but not
    // high priority since most use will be in browser
    const useLock = typeof window !== "undefined" && (await canUseIDB());
    const initialQuery = await cache.messageIds.get(messageIdsCacheKey);
    // Version identifies a query history; generation changes on each page
    // written to that history, including an empty page.
    let seenGeneration = initialQuery?.generation;
    let seenVersion = initialQuery?.version;
    let numSeen = source.kind === "continue" ? source.cursor.numSeen : 0;
    let firstPage = true;

    const requestPage = (cursor: string | undefined, signal?: AbortSignal) => {
      if (source.kind === "export") {
        return this.http.export(inboxUrl, source.inboxToken, cursor, signal);
      }
      if (cursor !== undefined) {
        return this.http.query(inboxUrl, { cursor }, inboxToken, signal);
      }
      if (source.kind !== "query") throw new GraffitiErrorCursorExpired("Cursor is stale");
      return this.http.query(inboxUrl, { tags: source.tags, schema: source.schema }, inboxToken, signal);
    };

    // Advance one page at most. Recheck the cache under the lock so a tab
    // waiting for another tab's fetch can reuse its result.
    const fetchPage = async (signal?: AbortSignal): Promise<CacheQueryValue> => {
      while (true) {
        signal?.throwIfAborted();
        const step = await this.withQueryLock(
          messageIdsCacheKey,
          useLock,
          async () => {
            signal?.throwIfAborted();
            // A different tab may have fetched a page while we waited for the lock.
            let query = await cache.messageIds.get(messageIdsCacheKey);
            if (cacheVersion !== undefined && cacheVersion !== query?.version) {
              throw new GraffitiErrorCursorExpired("Cursor is stale");
            }
            if (query?.version !== seenVersion) {
              // A cache reset after this stream yielded messages would replay
              // them. Report the stale cursor as a midstream expiry instead.
              if (!firstPage) throw new GraffitiErrorCursorExpired("Cursor is stale");
              numSeen = 0;
            }
            if (query?.generation && query.generation !== seenGeneration) {
              return { query };
            }

            // Reuse only a completed query. An empty completed discovery is
            // useful saved state too; a missing/partial query must still fetch.
            if (!refresh && query?.hasMore === false) return { query };

            // A cached Retry-After should not keep other tabs waiting on this lock.
            if (query?.waitTil !== undefined && query.waitTil > Date.now()) {
              return { waitTil: query.waitTil };
            }

            // See if the cursor is still active by requesting the next batch.
            let batch: Awaited<ReturnType<Inboxes["query"]>>;
            const invalidation = readUrl
              ? { url: readUrl, token: await cache.messageIds.readInvalidationToken(readUrl) }
              : undefined;
            try {
              batch = await requestPage(query?.cursor, signal);
            } catch (error) {
              if (
                !(error instanceof GraffitiErrorCursorExpired && query?.cursor)
              ) {
                // Throttle failed initial pages, including body/decode failures,
                // so callers cannot poll in a tight loop. Release the lock first.
                if (firstPage && !signal?.aborted) {
                  return { initialFetchError: error };
                }
                throw error;
              }
              // Only an initial cached cursor is retried. A cursor that
              // expires midstream must be reported to the caller.
              if (!firstPage) throw error;

              // The cursor is stale. A continuation must report that to its caller.
              await cache.messageIds.del(messageIdsCacheKey);
              if (cacheVersion !== undefined) throw error;
              query = undefined;
              numSeen = 0;
              batch = await requestPage(undefined, signal);
            }

            const { results, hasMore, cursor } = batch;
            const labeledMessages: LabeledMessage<Schema>[] = results.map(
              (result) => {
                const object =
                  result[LABELED_MESSAGE_MESSAGE_KEY][MESSAGE_OBJECT_KEY];
                if (!validator(object)) {
                  throw new Error("Server returned data that does not match schema");
                }
                return {
                  ...result,
                  [LABELED_MESSAGE_MESSAGE_KEY]: {
                    ...result[LABELED_MESSAGE_MESSAGE_KEY],
                    [MESSAGE_OBJECT_KEY]: object,
                  },
                };
              },
            );

            try {
              query = await storeQueryPage(
                cache,
                inboxUrl,
                messageIdsCacheKey,
                query,
                {
                  messages: labeledMessages,
                  cursor,
                  hasMore,
                  waitTil: batch.waitTil,
                  invalidation,
                },
              );
            } catch (error) {
              if (error instanceof ReadInvalidated) return { retry: true };
              throw error;
            }
            return { query };
          },
          signal,
        );

        if ("retry" in step) continue;
        if ("initialFetchError" in step) {
          console.error(
            "Unexpected error in stream, waiting 5 seconds before continuing...",
          );
          await new Promise((resolve) => setTimeout(resolve, 5000));
          throw step.initialFetchError;
        }
        if ("waitTil" in step) {
          await waitFor(step.waitTil);
          continue;
        }
        return step.query;
      }
    };

    type PageResult = { query: CacheQueryValue } | { error: unknown };
    let nextPage: Promise<PageResult> | undefined;
    while (true) {
      const result = nextPage
        ? await nextPage
        : await fetchPage().then(
            (query) => ({ query }),
            (error) => ({ error }),
          );
      nextPage = undefined;
      if ("error" in result) throw result.error;

      const query = result.query;
      // Replay all unseen messages after releasing the lock.
      const messages = await replayQuery(
        cache,
        inboxUrl,
        messageIdsCacheKey,
        query,
        numSeen,
      );
      numSeen = query.messageIds.length;
      seenGeneration = query.generation;
      seenVersion = query.version;
      firstPage = false;
      // The current page's lock is released. Fetch the next page while the
      // caller processes these messages; closing the stream aborts that fetch.
      const prefetchController = new AbortController();
      if (query.hasMore) {
        // The caller may close before awaiting this request; handle rejection
        // here so an aborted prefetch does not become unhandled.
        nextPage = fetchPage(prefetchController.signal).then(
          (query) => ({ query }),
          (error) => ({ error }),
        );
      }
      let consumedPage = false;
      try {
        for (const message of messages) {
          yield message as LabeledMessage<Schema>;
        }
        consumedPage = true;
      } finally {
        if (!consumedPage) prefetchController.abort();
      }

      if (!query.hasMore) {
        const outputCursor: infer_<typeof CursorSchema> = {
          numSeen,
          version: query.version,
          messageIdsCacheKey,
          objectSchema,
        };
        return JSON.stringify(outputCursor);
      }
    }
  }

  query<Schema extends JSONSchema>(
    inboxUrl: string,
    tags: Uint8Array[],
    objectSchema: Schema,
    inboxToken?: string | null,
    options?: InboxReadOptions,
  ): MessageStream<Schema> {
    verifyHTTPSEndpoint(inboxUrl);
    // Snapshot the filters so the cache key and the later HTTP request agree.
    return this.messageStreamer<Schema>({
      kind: "query",
      inboxUrl,
      ...structuredClone({ tags, schema: objectSchema }),
      inboxToken,
      options,
    });
  }

  continueQuery(
    inboxUrl: string,
    cursor: string,
    inboxToken?: string | null,
    options?: InboxReadOptions,
  ): MessageStream<{}> {
    verifyHTTPSEndpoint(inboxUrl);

    const decodedCursor = JSON.parse(cursor);
    const parsedCursor = CursorSchema.parse(decodedCursor);
    return this.messageStreamer<{}>({
      kind: "continue",
      inboxUrl,
      cursor: parsedCursor,
      inboxToken,
      options,
    });
  }

  export(inboxUrl: string, inboxToken: string): MessageStream<{}> {
    verifyHTTPSEndpoint(inboxUrl);
    return this.messageStreamer<{}>({
      kind: "export",
      inboxUrl,
      inboxToken,
    });
  }
}

const CursorSchema = strictObject({
  messageIdsCacheKey: string(),
  version: string(),
  numSeen: int().check(nonnegative()),
  objectSchema: union([looseObject({}), boolean()]),
});

export interface MessageStream<
  Schema extends JSONSchema,
> extends AsyncGenerator<LabeledMessage<Schema>, string> {}

async function waitFor(waitTil?: number) {
  if (waitTil !== undefined) {
    const waitFor = waitTil - Date.now();
    if (waitFor > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitFor));
    }
  }
}
