import type { JSONSchema, GraffitiObject } from "@graffiti-garden/api";
import {
  getAuthorizationEndpoint,
  fetchWithErrorHandling,
  verifyHTTPSEndpoint,
} from "./utilities";
import {
  compileGraffitiObjectSchema,
  GraffitiErrorCursorExpired,
} from "@graffiti-garden/api";
import {
  encode as dagCborEncode,
  decode as dagCborDecode,
} from "@ipld/dag-cbor";
import {
  type infer as infer_,
  string,
  url,
  array,
  optional,
  nullable,
  strictObject,
  looseObject,
  nonnegative,
  int,
  boolean,
  custom,
  number,
  union,
} from "zod/mini";

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
  ): Promise<LabeledMessageBase> {
    const messageCacheKey = getMessageCacheKey(inboxUrl, messageId);
    const cache = await this.cache;
    const cached = await cache.messages.get(messageCacheKey);
    if (cached) return cached;

    const url = `${inboxUrl}/message/${messageId}`;
    const response = await fetchWithErrorHandling(url, {
      method: "GET",
      headers: {
        ...(inboxToken
          ? {
              Authorization: `Bearer ${inboxToken}`,
            }
          : {}),
      },
    });

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
  ) {
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

  protected async *yieldFromCache(
    cache: Cache,
    inboxUrl: string,
    messageIdsCacheKey: string,
    cachedMessageIds: CacheQueryValue,
    cacheNumSeen: number = 0,
  ): AsyncGenerator<LabeledMessageBase> {
    // Filter out all messageIds before
    // the number already seen
    const messageIds = cachedMessageIds.messageIds.slice(cacheNumSeen);

    // Get all the messages pointed to in the cache
    const messages = await Promise.all(
      messageIds.map(async (id) => {
        const message = await cache.messages.get(
          getMessageCacheKey(inboxUrl, id),
        );
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

    yield* messages;
  }

  protected async *lockedMessageStreamer<Schema extends JSONSchema>(
    ...args: Parameters<typeof this.messageStreamer<Schema>>
  ): MessageStream<Schema> {
    if (typeof window === "undefined") {
      // TODO: implement locking in node as well, but not
      // high priority since most use will be in browser
      const streamer = this.messageStreamer<Schema>(...args);
      while (true) {
        const next = await streamer.next();
        if (next.done) return next.value;
        yield next.value;
      }
    }

    // Request the lock
    const messageIdsCacheKey = await args[0];
    let releaseLock = () => {};
    let hasLock: boolean = false;
    await new Promise<void>((resolvehasLock) => {
      window.navigator.locks.request(
        messageIdsCacheKey,
        {
          mode: "exclusive",
          ifAvailable: true,
        },
        async (lock) => {
          // Immediately return whether we
          // acquired the lock or not
          hasLock = !!lock;
          resolvehasLock();

          // Then wait for the release to be called
          await new Promise<void>((r) => (releaseLock = r));
        },
      );
    });
    if (hasLock) {
      // If we have the lock, simply proceed with the regular streamer
      try {
        const streamer = this.messageStreamer<Schema>(...args);
        while (true) {
          const next = await streamer.next();
          if (next.done) return next.value;
          yield next.value;
        }
      } finally {
        // Release the lock when all done
        releaseLock();
      }
    }

    // Someone else has the lock,
    // so wait until the lock is released,
    // then just return from the cache
    releaseLock();
    await window.navigator.locks.request(messageIdsCacheKey, () => {});

    // TODO: the arguments here are brittle
    // at some point, refactor things
    const inboxUrl = args[1];
    const objectSchema = args[5] ?? {};
    const cacheVersion = args[6];
    const cacheNumSeen = args[7];

    const cache = await this.cache;
    const cachedMessageIds = await cache.messageIds.get(messageIdsCacheKey);
    if (!cachedMessageIds) {
      throw new Error("Cache not found");
    }
    if (
      cacheVersion !== undefined &&
      cacheVersion !== cachedMessageIds.version
    ) {
      throw new GraffitiErrorCursorExpired("Cursor is stale");
    }

    const iterator = this.yieldFromCache(
      cache,
      inboxUrl,
      messageIdsCacheKey,
      cachedMessageIds,
      cacheNumSeen,
    );
    for await (const m of iterator) yield m as LabeledMessage<Schema>;

    const outputCursor: infer_<typeof CursorSchema> = {
      numSeen: cachedMessageIds.messageIds.length,
      version: cachedMessageIds.version,
      messageIdsCacheKey,
      objectSchema,
    };

    return JSON.stringify(outputCursor);
  }

  protected async *messageStreamer<Schema extends JSONSchema>(
    messageIdsCacheKey_: Promise<string>,
    inboxUrl: string,
    type: "export" | "query",
    body: Uint8Array<ArrayBuffer> | undefined,
    inboxToken?: string | null,
    objectSchema: Schema = {} as Schema,
    cacheVersion?: string,
    cacheNumSeen: number = 0,
  ): MessageStream<Schema> {
    const validator = await compileGraffitiObjectSchema(objectSchema);
    const messageIdsCacheKey = await messageIdsCacheKey_;
    const cache = await this.cache;

    let cachedMessageIds = await cache.messageIds.get(messageIdsCacheKey);
    if (
      cacheVersion !== undefined &&
      cacheVersion !== cachedMessageIds?.version
    ) {
      throw new GraffitiErrorCursorExpired("Cursor is stale");
    }

    // If we are rate-limited, wait
    let waitTil = cachedMessageIds?.waitTil;
    await waitFor(waitTil);

    // See if the cursor is still active by
    // requesting an initial batch of messages
    const cachedCursor = cachedMessageIds?.cursor;
    let firstResponse: Response | undefined = undefined;
    try {
      const out = await this.fetchMessageBatch(
        inboxUrl,
        type,
        body,
        inboxToken,
        cachedCursor,
      );
      firstResponse = out.response;
      waitTil = out.waitTil;
    } catch (e) {
      if (!(e instanceof GraffitiErrorCursorExpired && cachedCursor)) {
        console.error(
          "Unexpected error in stream, waiting 5 seconds before continuing...",
        );
        await new Promise((resolve) => setTimeout(resolve, 5000));
        throw e;
      }

      // The cursor is stale
      await cache.messageIds.del(messageIdsCacheKey);
      if (cacheVersion === undefined) {
        // The query is not a continuation
        // so we can effectively ignore the error
        cachedMessageIds = undefined;
      } else {
        // Otherwise propogate it up so the
        // consumer can clear their message history
        throw e;
      }
    }

    if (firstResponse !== undefined && cachedMessageIds) {
      // Cursor is valid! Yield from the cache
      const iterator = this.yieldFromCache(
        cache,
        inboxUrl,
        messageIdsCacheKey,
        cachedMessageIds,
        cacheNumSeen,
      );
      for await (const m of iterator) yield m as LabeledMessage<Schema>;
    }

    if (firstResponse === undefined) {
      // The cursor was stale: try again
      const out = await this.fetchMessageBatch(
        inboxUrl,
        type,
        body,
        inboxToken,
      );
      firstResponse = out.response;
      waitTil = out.waitTil;
    }

    // Continue streaming results
    let response = firstResponse;
    let cursor: string;
    const version = cachedMessageIds?.version ?? crypto.randomUUID();
    let messageIds = cachedMessageIds?.messageIds ?? [];
    while (true) {
      const blob = await response.blob();
      const decoded = dagCborDecode(await blob.arrayBuffer());
      const {
        results,
        hasMore,
        cursor: nextCursor,
      } = MessageResultSchema.parse(decoded);
      cursor = nextCursor;

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

      // First cache the messages with their labels
      await Promise.all(
        labeledMessages.map((m: LabeledMessageBase) =>
          cache.messages.set(
            getMessageCacheKey(inboxUrl, m[LABELED_MESSAGE_ID_KEY]),
            m,
          ),
        ),
      );
      // Then store all the messageids
      messageIds = [
        ...messageIds,
        ...labeledMessages.map(
          (m: LabeledMessageBase) => m[LABELED_MESSAGE_ID_KEY],
        ),
      ];
      await cache.messageIds.set(messageIdsCacheKey, {
        cursor,
        version,
        messageIds,
        waitTil,
      });

      // Update how many we've seen
      cacheNumSeen += labeledMessages.length;

      // Return the values
      for (const m of labeledMessages) yield m;

      if (!hasMore) break;

      // Otherwise get another response (after waiting for rate-limit)
      await waitFor(waitTil);
      const out = await this.fetchMessageBatch(
        inboxUrl,
        type,
        undefined, // Body is never past the first time
        inboxToken,
        cursor,
      );
      response = out.response;
      waitTil = out.waitTil;
    }

    const outputCursor: infer_<typeof CursorSchema> = {
      numSeen: cacheNumSeen,
      version,
      messageIdsCacheKey,
      objectSchema,
    };

    return JSON.stringify(outputCursor);
  }

  query<Schema extends JSONSchema>(
    inboxUrl: string,
    tags: Uint8Array[],
    objectSchema: Schema,
    inboxToken?: string | null,
  ): MessageStream<Schema> {
    verifyHTTPSEndpoint(inboxUrl);

    const body = dagCborEncode({
      tags,
      schema: objectSchema,
    });

    const messageIdsCacheKey = getMessageIdsCacheKey(inboxUrl, "query", body);
    return this.lockedMessageStreamer<Schema>(
      messageIdsCacheKey,
      inboxUrl,
      "query",
      new Uint8Array(body),
      inboxToken,
      objectSchema,
    );
  }

  continueQuery(
    inboxUrl: string,
    cursor: string,
    inboxToken?: string | null,
  ): MessageStream<{}> {
    verifyHTTPSEndpoint(inboxUrl);

    const decodedCursor = JSON.parse(cursor);
    const { messageIdsCacheKey, numSeen, objectSchema, version } =
      CursorSchema.parse(decodedCursor);

    return this.lockedMessageStreamer<{}>(
      Promise.resolve(messageIdsCacheKey),
      inboxUrl,
      "query",
      undefined,
      inboxToken,
      objectSchema,
      version,
      numSeen,
    );
  }

  export(inboxUrl: string, inboxToken: string): MessageStream<{}> {
    verifyHTTPSEndpoint(inboxUrl);
    const messageIdsCacheKey = getMessageIdsCacheKey(inboxUrl, "export");
    return this.lockedMessageStreamer<{}>(
      messageIdsCacheKey,
      inboxUrl,
      "export",
      undefined,
      inboxToken,
    );
  }
}

const GraffitiObjectSchema = strictObject({
  value: looseObject({}),
  channels: array(string()),
  allowed: optional(nullable(array(url()))),
  url: url(),
  actor: url(),
});
export const Uint8ArraySchema = custom<Uint8Array>(
  (v): v is Uint8Array => v instanceof Uint8Array,
);
export const TagsSchema = array(Uint8ArraySchema);

export const MESSAGE_TAGS_KEY = "t";
export const MESSAGE_OBJECT_KEY = "o";
export const MESSAGE_METADATA_KEY = "m";
export const MessageBaseSchema = strictObject({
  [MESSAGE_TAGS_KEY]: TagsSchema,
  [MESSAGE_OBJECT_KEY]: GraffitiObjectSchema,
  [MESSAGE_METADATA_KEY]: Uint8ArraySchema,
});
type MessageBase = infer_<typeof MessageBaseSchema>;

export const LABELED_MESSAGE_ID_KEY = "id";
export const LABELED_MESSAGE_MESSAGE_KEY = "m";
export const LABELED_MESSAGE_LABEL_KEY = "l";
export const LabeledMessageBaseSchema = strictObject({
  [LABELED_MESSAGE_ID_KEY]: string(),
  [LABELED_MESSAGE_MESSAGE_KEY]: MessageBaseSchema,
  [LABELED_MESSAGE_LABEL_KEY]: number(),
});
type LabeledMessageBase = infer_<typeof LabeledMessageBaseSchema>;

export type Message<Schema extends JSONSchema> = MessageBase & {
  [MESSAGE_OBJECT_KEY]: GraffitiObject<Schema>;
};
export type LabeledMessage<Schema extends JSONSchema> = LabeledMessageBase & {
  [LABELED_MESSAGE_MESSAGE_KEY]: {
    [MESSAGE_OBJECT_KEY]: GraffitiObject<Schema>;
  };
};

const SendResponseSchema = strictObject({ id: string() });

const MessageResultSchema = strictObject({
  results: array(LabeledMessageBaseSchema),
  hasMore: boolean(),
  cursor: string(),
});

const CursorSchema = strictObject({
  messageIdsCacheKey: string(),
  version: string(),
  numSeen: int().check(nonnegative()),
  objectSchema: union([looseObject({}), boolean()]),
});

export interface MessageStream<
  Schema extends JSONSchema,
> extends AsyncGenerator<LabeledMessage<Schema>, string> {}

type CacheQueryValue = {
  cursor: string;
  version: string;
  messageIds: string[];
  waitTil?: number;
};

const HAS_IDB =
  typeof globalThis !== "undefined" &&
  !!(globalThis as any).indexedDB &&
  typeof (globalThis as any).indexedDB.open === "function";

type Cache = {
  messages: {
    get(k: string): Promise<LabeledMessageBase | undefined>;
    set(k: string, value: LabeledMessageBase): Promise<void>;
    del(k: string): Promise<void>;
  };
  messageIds: {
    get(k: string): Promise<CacheQueryValue | undefined>;
    set(k: string, value: CacheQueryValue): Promise<void>;
    del(k: string): Promise<void>;
  };
};

function getMessageCacheKey(inboxUrl: string, messageId: string) {
  return `${encodeURIComponent(inboxUrl)}:${encodeURIComponent(messageId)}`;
}
async function getMessageIdsCacheKey(
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
async function createCache(): Promise<Cache> {
  if (HAS_IDB) {
    const { openDB } = await import("idb");
    const db = await openDB("graffiti-inbox-cache", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("m")) db.createObjectStore("m");
        if (!db.objectStoreNames.contains("q")) db.createObjectStore("q");
      },
    });

    return {
      messages: {
        get: (k) => db.get("m", k),
        set: async (k, v) => {
          await db.put("m", v, k);
        },
        del: (k) => db.delete("m", k),
      },
      messageIds: {
        get: async (k) => await db.get("q", k),
        set: async (k, v) => {
          await db.put("q", v, k);
        },
        del: (k) => db.delete("q", k),
      },
    };
  }

  const m = new Map<string, LabeledMessageBase>();
  const q = new Map<string, CacheQueryValue>();

  return {
    messages: {
      get: async (k) => m.get(k),
      set: async (k, v) => void m.set(k, v),
      del: async (k) => void m.delete(k),
    },
    messageIds: {
      get: async (k) => q.get(k),
      set: async (k, v) => void q.set(k, v),
      del: async (k) => void q.delete(k),
    },
  };
}

async function waitFor(waitTil?: number) {
  if (waitTil !== undefined) {
    const waitFor = waitTil - Date.now();
    if (waitFor > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitFor));
    }
  }
}
