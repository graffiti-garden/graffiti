import type { JSONSchema } from "@graffiti-garden/api";
import {
  getAuthorizationEndpoint,
  fetchWithErrorHandling,
  verifyHTTPSEndpoint,
} from "./utilities";
import {
  compileGraffitiObjectSchema,
  GraffitiErrorCursorExpired,
  GraffitiErrorNotFound,
} from "@graffiti-garden/api";
import {
  encode as dagCborEncode,
  decode as dagCborDecode,
} from "@ipld/dag-cbor";
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
  LabeledMessageBaseSchema,
  SendResponseSchema,
  MessageResultSchema,
  LABELED_MESSAGE_MESSAGE_KEY,
  MESSAGE_OBJECT_KEY,
} from "./4-inboxes/messages";
import type {
  LabeledMessageBase,
  LabeledMessage,
  Message,
} from "./4-inboxes/messages";
import {
  canUseIDB,
  createCache,
  getMessageCacheKey,
  getMessageIdsCacheKey,
  replayQuery,
  storeQueryPage,
} from "./4-inboxes/cache";
import type { Cache, CacheQueryValue } from "./4-inboxes/cache";

export {
  Uint8ArraySchema,
  TagsSchema,
  MESSAGE_TAGS_KEY,
  MESSAGE_OBJECT_KEY,
  MESSAGE_METADATA_KEY,
  MessageBaseSchema,
  LABELED_MESSAGE_ID_KEY,
  LABELED_MESSAGE_MESSAGE_KEY,
  LABELED_MESSAGE_LABEL_KEY,
  LabeledMessageBaseSchema,
} from "./4-inboxes/messages";
export type { Message, LabeledMessage } from "./4-inboxes/messages";

// One batch may be slow on a mobile connection. This bounds the network request
// and response-body read, not IndexedDB or time spent yielding messages.
const INBOX_REQUEST_TIMEOUT_MS = 30_000;
// A stalled tab should not make peers wait indefinitely. This only bounds
// lock acquisition; the request above bounds work after acquisition.
const INBOX_LOCK_WAIT_TIMEOUT_MS = 30_000;

type StreamSource<Schema extends JSONSchema> =
  | {
      kind: "query";
      inboxUrl: string;
      body: Uint8Array<ArrayBuffer>;
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
    };

export class Inboxes {
  getAuthorizationEndpoint = getAuthorizationEndpoint;
  protected cache_: Promise<Cache> | null = null;
  protected get cache() {
    if (!this.cache_) {
      this.cache_ = createCache();
    }
    return this.cache_;
  }

  async send(inboxUrl: string, message: Message<{}>): Promise<string> {
    verifyHTTPSEndpoint(inboxUrl);
    const url = `${inboxUrl}/send`;

    const response = await fetchWithErrorHandling(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/cbor",
      },
      body: new Uint8Array(dagCborEncode({ m: message })),
    });

    const blob = await response.blob();
    const cbor = dagCborDecode(await blob.arrayBuffer());
    const parsed = SendResponseSchema.parse(cbor);
    return parsed.id;
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

    const url = `${inboxUrl}/message/${messageId}`;
    let response: Response | null = null;
    try {
      response = await fetchWithErrorHandling(url, {
        method: "GET",
        headers: {
          ...(inboxToken
            ? {
                Authorization: `Bearer ${inboxToken}`,
              }
            : {}),
        },
      });
    } catch (e) {
      if (e instanceof GraffitiErrorNotFound) {
        await cache.messages.set(messageCacheKey, null);
        return null;
      }
      throw e;
    }

    const blob = await response.blob();
    const cbor = dagCborDecode(await blob.arrayBuffer());
    const parsed = LabeledMessageBaseSchema.parse(cbor);

    await cache.messages.set(messageCacheKey, parsed);
    return parsed;
  }

  async label(
    inboxUrl: string,
    messageId: string,
    label: number,
    inboxToken?: string | null,
  ): Promise<void> {
    verifyHTTPSEndpoint(inboxUrl);

    if (inboxToken) {
      const url = `${inboxUrl}/label/${messageId}`;

      await fetchWithErrorHandling(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/cbor",
          Authorization: `Bearer ${inboxToken}`,
        },
        body: new Uint8Array(dagCborEncode({ l: label })),
      });
    }

    // Update the cache, even if no token.
    // Therefore people not logged in do not need to
    // repeatedly re-validate objects.
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

  protected async fetchMessageBatch(
    inboxUrl: string,
    type: "query" | "export",
    body: Uint8Array<ArrayBuffer> | undefined,
    inboxToken?: string | null,
    cursor?: string,
    signal?: AbortSignal,
  ) {
    // Keep the deadline active while the response body is being read, too.
    const timeout = AbortSignal.timeout(INBOX_REQUEST_TIMEOUT_MS);
    const response = await fetchWithErrorHandling(
      `${inboxUrl}/${type}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/cbor",
          ...(inboxToken
            ? {
                Authorization: `Bearer ${inboxToken}`,
              }
            : {}),
        },
        body,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      },
    );
    const retryAfterHeader = response.headers.get("Retry-After");
    const retryAfter = retryAfterHeader
      ? parseInt(retryAfterHeader)
      : undefined;

    const waitTil =
      retryAfter && Number.isFinite(retryAfter)
        ? Date.now() + retryAfter * 1000
        : undefined;

    return { response, waitTil };
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
    const body = source.kind === "query" ? source.body : undefined;
    const messageIdsCacheKey = source.kind === "continue"
      ? source.cursor.messageIdsCacheKey
      : await getMessageIdsCacheKey(inboxUrl, type, body);
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

            // A cached Retry-After should not keep other tabs waiting on this lock.
            if (query?.waitTil !== undefined && query.waitTil > Date.now()) {
              return { waitTil: query.waitTil };
            }

            // See if the cursor is still active by requesting the next batch.
            let batch: { response: Response; waitTil?: number };
            try {
              batch = await this.fetchMessageBatch(
                inboxUrl,
                type,
                firstPage ? body : undefined, // Later pages send no body.
                inboxToken,
                query?.cursor,
                signal,
              );
            } catch (error) {
              if (
                !(error instanceof GraffitiErrorCursorExpired && query?.cursor)
              ) {
                // Preserve the old initial-page error backoff, but wait only
                // after releasing the Web Lock.
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
              batch = await this.fetchMessageBatch(
                inboxUrl,
                type,
                body,
                inboxToken,
                undefined,
                signal,
              );
            }

            const decoded = dagCborDecode(
              new Uint8Array(await batch.response.arrayBuffer()),
            );
            const { results, hasMore, cursor } =
              MessageResultSchema.parse(decoded);
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
              },
            );
            return { query };
          },
          signal,
        );

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
  ): MessageStream<Schema> {
    verifyHTTPSEndpoint(inboxUrl);
    const body = new Uint8Array(dagCborEncode({
      tags,
      schema: objectSchema,
    }));
    return this.messageStreamer<Schema>({
      kind: "query",
      inboxUrl,
      body,
      schema: objectSchema,
      inboxToken,
    });
  }

  continueQuery(
    inboxUrl: string,
    cursor: string,
    inboxToken?: string | null,
  ): MessageStream<{}> {
    verifyHTTPSEndpoint(inboxUrl);

    const decodedCursor = JSON.parse(cursor);
    const parsedCursor = CursorSchema.parse(decodedCursor);
    return this.messageStreamer<{}>({
      kind: "continue",
      inboxUrl,
      cursor: parsedCursor,
      inboxToken,
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
