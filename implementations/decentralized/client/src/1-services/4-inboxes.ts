import type {
  JSONSchema,
  GraffitiObject,
  GraffitiObjectBase,
} from "@graffiti-garden/api";
import {
  getAuthorizationEndpoint,
  fetchWithErrorHandling,
  verifyHTTPSEndpoint,
} from "./utilities";
import z from "zod";
import {
  GraffitiErrorInvalidSchema,
  GraffitiErrorNotFound,
} from "@graffiti-garden/api";
import Ajv from "ajv";
import {
  encode as dagCborEncode,
  decode as dagCborDecode,
} from "@ipld/dag-cbor";

export class Inboxes {
  protected readonly ajv = new Ajv({ strict: false });
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
      body: new Uint8Array(dagCborEncode(message)),
    });

    const json = await response.json();
    const parsed = SendResponseSchema.parse(json);
    return parsed.id;
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
          "Content-Type": "application/json",
          Authorization: `Bearer ${inboxToken}`,
        },
        body: JSON.stringify({ l: label }),
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

  protected fetchMessageBatch(
    inboxUrl: string,
    type: "query" | "export",
    body: Uint8Array<ArrayBuffer> | undefined,
    inboxToken?: string | null,
    cursor?: string,
  ) {
    return fetchWithErrorHandling(
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
    const validator = compileGraffitiObjectSchema(this.ajv, objectSchema);
    const messageIdsCacheKey = await messageIdsCacheKey_;
    const cache = await this.cache;

    let cachedMessageIds = await cache.messageIds.get(messageIdsCacheKey);
    if (
      cacheVersion !== undefined &&
      cacheVersion !== cachedMessageIds?.version
    ) {
      throw new GraffitiErrorNotFound("Cursor is stale");
    }

    // See if the cursor is still active by
    // requesting an initial batch of messages
    const cachedCursor = cachedMessageIds?.cursor;
    let firstResponse: Response | undefined = undefined;
    try {
      firstResponse = await this.fetchMessageBatch(
        inboxUrl,
        type,
        body,
        inboxToken,
        cachedCursor,
      );
    } catch (e) {
      if (!(e instanceof GraffitiErrorNotFound && cachedCursor)) {
        // Unexpected error
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
      // The cursor is valid!

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
            throw new Error(
              "Cache out of sync - perhaps clear browser storage",
            );
          }
          return message;
        }),
      );

      for (const message of messages) {
        yield message as LabeledMessage<Schema>;
      }
    }

    if (firstResponse === undefined) {
      // The cursor was stale: try again
      firstResponse = await this.fetchMessageBatch(
        inboxUrl,
        type,
        body,
        inboxToken,
      );
    }

    // Continue streaming results
    let response = firstResponse;
    let cursor: string;
    const version =
      cacheVersion ?? (Math.random() + 1).toString(36).substring(2);
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
      });

      // Update how many we've seen
      cacheNumSeen += labeledMessages.length;

      // Return the values
      for (const m of labeledMessages) yield m;

      if (!hasMore) break;

      // Otherwise get another response
      response = await this.fetchMessageBatch(
        inboxUrl,
        type,
        undefined, // Body is never past the first time
        inboxToken,
        cursor,
      );
    }

    const outputCursor: z.infer<typeof CursorSchema> = {
      numSeen: cacheNumSeen,
      version,
      messageIdsCacheKey,
      objectSchema,
    };

    return {
      cursor: JSON.stringify(outputCursor),
      continue: (inboxToken?: string | null) =>
        this.messageStreamer<Schema>(
          messageIdsCacheKey_,
          inboxUrl,
          type,
          undefined,
          inboxToken,
          objectSchema,
          version,
          cacheNumSeen,
        ),
    };
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
    return this.messageStreamer<Schema>(
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

    return this.messageStreamer<{}>(
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
    return this.messageStreamer<{}>(
      messageIdsCacheKey,
      inboxUrl,
      "export",
      undefined,
      inboxToken,
    );
  }
}

const GraffitiObjectSchema = z
  .object({
    value: z.looseObject({}),
    channels: z.array(z.string()),
    allowed: z.array(z.url()).nullable().optional(),
    url: z.url(),
    actor: z.url(),
  })
  .strict();
export const Uint8ArraySchema = z.custom<Uint8Array>(
  (v): v is Uint8Array => v instanceof Uint8Array,
);
export const TagsSchema = z.array(Uint8ArraySchema);

export const MESSAGE_TAGS_KEY = "t";
export const MESSAGE_OBJECT_KEY = "o";
export const MESSAGE_METADATA_KEY = "m";
export const MessageBaseSchema = z
  .object({
    [MESSAGE_TAGS_KEY]: TagsSchema,
    [MESSAGE_OBJECT_KEY]: GraffitiObjectSchema,
    [MESSAGE_METADATA_KEY]: Uint8ArraySchema,
  })
  .strict();
type MessageBase = z.infer<typeof MessageBaseSchema>;

export const LABELED_MESSAGE_ID_KEY = "id";
export const LABELED_MESSAGE_MESSAGE_KEY = "m";
export const LABELED_MESSAGE_LABEL_KEY = "l";
export const LabeledMessageBaseSchema = z
  .object({
    [LABELED_MESSAGE_ID_KEY]: z.string(),
    [LABELED_MESSAGE_MESSAGE_KEY]: MessageBaseSchema,
    [LABELED_MESSAGE_LABEL_KEY]: z.number(),
  })
  .strict();
type LabeledMessageBase = z.infer<typeof LabeledMessageBaseSchema>;

export type Message<Schema extends JSONSchema> = MessageBase & {
  [MESSAGE_OBJECT_KEY]: GraffitiObject<Schema>;
};
export type LabeledMessage<Schema extends JSONSchema> = LabeledMessageBase & {
  [LABELED_MESSAGE_MESSAGE_KEY]: {
    [MESSAGE_OBJECT_KEY]: GraffitiObject<Schema>;
  };
};

export function compileGraffitiObjectSchema<Schema extends JSONSchema>(
  ajv: Ajv,
  schema: Schema,
) {
  try {
    // Force the validation guard because
    // it is too big for the type checker.
    // Fortunately json-schema-to-ts is
    // well tested against ajv.
    return ajv.compile(schema) as (
      data: GraffitiObjectBase,
    ) => data is GraffitiObject<Schema>;
  } catch (error) {
    throw new GraffitiErrorInvalidSchema(
      error instanceof Error ? error.message : undefined,
    );
  }
}

const SendResponseSchema = z.object({ id: z.string() }).strict();

const MessageResultSchema = z
  .object({
    results: z.array(LabeledMessageBaseSchema),
    hasMore: z.boolean(),
    cursor: z.string(),
  })
  .strict();

const CursorSchema = z
  .object({
    messageIdsCacheKey: z.string(),
    version: z.string(),
    numSeen: z.int().nonnegative(),
    objectSchema: z.any(),
  })
  .strict();

export interface MessageStreamReturn<Schema extends JSONSchema> {
  cursor: string;
  continue: (inboxToken?: string | null) => MessageStream<Schema>;
}

export interface MessageStream<
  Schema extends JSONSchema,
> extends AsyncGenerator<LabeledMessage<Schema>, MessageStreamReturn<Schema>> {}

type CacheQueryValue = {
  cursor: string;
  version: string;
  messageIds: string[];
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
