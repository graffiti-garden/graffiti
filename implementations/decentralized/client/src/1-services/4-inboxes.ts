import { GraffitiErrorNotFound, type JSONSchema, type GraffitiObject } from "@graffiti-garden/api";
import { encode as dagCborEncode, decode as dagCborDecode } from "@ipld/dag-cbor";
import { getAuthorizationEndpoint, fetchWithErrorHandling, verifyHTTPSEndpoint } from "./utilities";
import {
  type infer as infer_,
  string,
  url,
  array,
  optional,
  nullable,
  strictObject,
  looseObject,
  custom,
  number,
  boolean,
} from "zod/mini";

// Keep the deadline active through the response body. Query history and locks
// are handled by the caller; this client has no persistent state.
const INBOX_REQUEST_TIMEOUT_MS = 30_000;

export class Inboxes {
  getAuthorizationEndpoint = getAuthorizationEndpoint;

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

  async pin(inboxUrl: string, ids: string[], inboxToken: string): Promise<void> {
    await this.updatePins(inboxUrl, "pin", ids, inboxToken);
  }

  async unpin(inboxUrl: string, ids: string[], inboxToken: string): Promise<void> {
    await this.updatePins(inboxUrl, "unpin", ids, inboxToken);
  }

  private async updatePins(inboxUrl: string, operation: "pin" | "unpin", ids: string[], inboxToken: string) {
    verifyHTTPSEndpoint(inboxUrl);
    const unique = [...new Set(ids)];
    for (let i = 0; i < unique.length; i += 100) {
      await fetchWithErrorHandling(`${inboxUrl}/${operation}`, {
        method: "POST",
        headers: { "Content-Type": "application/cbor", Authorization: `Bearer ${inboxToken}` },
        body: dagCborEncode({ ids: unique.slice(i, i + 100) }).slice(),
        signal: AbortSignal.timeout(INBOX_REQUEST_TIMEOUT_MS),
      });
    }
  }

  async get(
    inboxUrl: string,
    messageId: string,
    inboxToken?: string | null,
  ): Promise<LabeledMessageBase | null> {
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
        return null;
      }
      throw e;
    }

    const blob = await response.blob();
    const cbor = dagCborDecode(await blob.arrayBuffer());
    const parsed = LabeledMessageBaseSchema.parse(cbor);

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
  }

  query(
    inboxUrl: string,
    query: { tags: Uint8Array[]; schema: JSONSchema } | { cursor: string },
    inboxToken?: string | null,
    signal?: AbortSignal,
  ) {
    return this.fetchPage(inboxUrl, "query", query, inboxToken, signal);
  }

  export(
    inboxUrl: string,
    inboxToken: string,
    cursor?: string,
    signal?: AbortSignal,
  ) {
    return this.fetchPage(inboxUrl, "export", cursor === undefined ? {} : { cursor }, inboxToken, signal);
  }

  private async fetchPage(
    inboxUrl: string,
    type: "query" | "export",
    body: object,
    inboxToken?: string | null,
    signal?: AbortSignal,
  ) {
    verifyHTTPSEndpoint(inboxUrl);
    // Keep the deadline active while the response body is being read, too.
    const timeout = AbortSignal.timeout(INBOX_REQUEST_TIMEOUT_MS);
    const response = await fetchWithErrorHandling(
      `${inboxUrl}/${type}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/cbor",
          ...(inboxToken
            ? { Authorization: `Bearer ${inboxToken}` }
            : {}),
        },
        body: new Uint8Array(dagCborEncode(body)),
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

    const decoded = dagCborDecode(new Uint8Array(await response.arrayBuffer()));
    return { ...MessageResultSchema.parse(decoded), waitTil };
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
export const PINNED_BY_ME_KEY = "p";
export const LabeledMessageBaseSchema = strictObject({
  [LABELED_MESSAGE_ID_KEY]: string(),
  [LABELED_MESSAGE_MESSAGE_KEY]: MessageBaseSchema,
  [LABELED_MESSAGE_LABEL_KEY]: number(),
  // Absent on older servers, cached announcements, and the legacy /message route.
  [PINNED_BY_ME_KEY]: optional(boolean()),
});
export type LabeledMessageBase = infer_<typeof LabeledMessageBaseSchema>;

export type Message<Schema extends JSONSchema> = MessageBase & {
  [MESSAGE_OBJECT_KEY]: GraffitiObject<Schema>;
};
export type LabeledMessage<Schema extends JSONSchema> = LabeledMessageBase & {
  [LABELED_MESSAGE_MESSAGE_KEY]: {
    [MESSAGE_OBJECT_KEY]: GraffitiObject<Schema>;
  };
};

export const SendResponseSchema = strictObject({ id: string() });

export const MessageResultSchema = strictObject({
  results: array(LabeledMessageBaseSchema),
  hasMore: boolean(),
  cursor: string(),
});
