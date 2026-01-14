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
import { GraffitiErrorInvalidSchema } from "@graffiti-garden/api";
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
    if (inboxToken) {
      verifyHTTPSEndpoint(inboxUrl);
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

    // Update the cache
    const result = await (await this.cache).messages.get(messageId);
    if (result) {
      await (
        await this.cache
      ).messages.set(
        // TODO:
        // add the inboxUrl as well to disambiguate
        messageId,
        { ...result, l: label },
      );
    }
  }

  protected async *messageStreamer<Schema extends JSONSchema>(
    url: string,
    cursor: string | undefined,
    body: Uint8Array<ArrayBuffer> | undefined,
    inboxToken?: string | null,
    objectSchema: Schema = {} as Schema,
  ): MessageStream<Schema> {
    // TODO: get from the cache
    // if it exists, try to get the first response with the cursor
    // if it results in a GraffitiErrorNotFound, the cursor
    // has expired... if so clear the cache.
    // Otherwise, return all the cached results, then continue
    // reading from the response
    //
    // Also store the queries under hash(url, body) and store that
    // id in a cursor.

    const validator = compileGraffitiObjectSchema(this.ajv, objectSchema);

    while (true) {
      const response = await fetchWithErrorHandling(
        `${url}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
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

      // TODO:
      // Store the results in the cache

      for (const m of labeledMessages) yield m;

      if (!hasMore) break;
    }
    if (!cursor) {
      throw new Error("There must be a cursor...");
    }

    const outputCursor: z.infer<typeof CursorSchema> = {
      cursor,
      objectSchema,
    };

    return {
      cursor: JSON.stringify(outputCursor),
      continue: (inboxToken?: string | null) =>
        this.messageStreamer<Schema>(
          url,
          cursor,
          body,
          inboxToken,
          objectSchema,
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
    const url = `${inboxUrl}/query`;

    const body = dagCborEncode({
      tags,
      schema: objectSchema,
    });

    return this.messageStreamer<Schema>(
      url,
      undefined,
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
    const url = `${inboxUrl}/query`;

    const decodedCursor = JSON.parse(cursor);
    const { cursor: actualCursor, objectSchema } =
      CursorSchema.parse(decodedCursor);

    return this.messageStreamer<{}>(
      url,
      actualCursor,
      undefined,
      inboxToken,
      objectSchema,
    );
  }

  export(inboxUrl: string, inboxToken: string): MessageStream<{}> {
    verifyHTTPSEndpoint(inboxUrl);
    const url = `${inboxUrl}/export`;
    return this.messageStreamer<{}>(url, undefined, undefined, inboxToken);
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
export const LabeledMessageBaseSchema = z.object({
  [LABELED_MESSAGE_ID_KEY]: z.string(),
  [LABELED_MESSAGE_MESSAGE_KEY]: MessageBaseSchema,
  [LABELED_MESSAGE_LABEL_KEY]: z.number(),
});
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

const SendResponseSchema = z.object({ id: z.string() });

const MessageResultSchema = z.object({
  results: z.array(LabeledMessageBaseSchema),
  hasMore: z.boolean(),
  cursor: z.string(),
});

const CursorSchema = z.object({
  cursor: z.string(),
  objectSchema: z.any(),
});

export interface MessageStreamReturn<Schema extends JSONSchema> {
  cursor: string;
  continue: (inboxToken?: string | null) => MessageStream<Schema>;
}

export interface MessageStream<
  Schema extends JSONSchema,
> extends AsyncGenerator<LabeledMessage<Schema>, MessageStreamReturn<Schema>> {}

type CacheQueryValue = {
  cursor: string;
  messageIds: string[];
};

const HAS_IDB =
  typeof globalThis !== "undefined" &&
  !!(globalThis as any).indexedDB &&
  typeof (globalThis as any).indexedDB.open === "function";

type Cache = {
  messages: {
    get(messageId: string): Promise<LabeledMessageBase | undefined>;
    set(messageId: string, value: LabeledMessageBase): Promise<void>;
    del(messageId: string): Promise<void>;
  };
  queries: {
    get(queryUrl: string): Promise<CacheQueryValue | undefined>;
    set(queryUrl: string, value: CacheQueryValue): Promise<void>;
    del(queryUrl: string): Promise<void>;
  };
};

async function createCache(): Promise<Cache> {
  if (HAS_IDB) {
    const { openDB } = await import("idb");
    const db = await openDB("graffiti-inboc-cache", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("m")) db.createObjectStore("m");
        if (!db.objectStoreNames.contains("q")) db.createObjectStore("q");
      },
    });

    return {
      messages: {
        get: (id) => db.get("m", id),
        set: async (id, v) => {
          await db.put("m", v, id);
        },
        del: (messageId) => db.delete("m", messageId),
      },
      queries: {
        get: async (url) => await db.get("q", url),
        set: async (url, v) => {
          await db.put("q", v, url);
        },
        del: (url) => db.delete("q", url),
      },
    };
  }

  const m = new Map<string, LabeledMessageBase>();
  const q = new Map<string, CacheQueryValue>();

  return {
    messages: {
      get: async (id) => m.get(id),
      set: async (id, v) => void m.set(id, v),
      del: async (id) => void m.delete(id),
    },
    queries: {
      get: async (url) => q.get(url),
      set: async (url, v) => void q.set(url, v),
      del: async (url) => void q.delete(url),
    },
  };
}
