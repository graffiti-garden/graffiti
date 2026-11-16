import { GraffitiErrorNotFound } from "@graffiti-garden/api";
import { encode as dagCborEncode, decode as dagCborDecode } from "@ipld/dag-cbor";
import { getAuthorizationEndpoint, fetchWithErrorHandling, verifyHTTPSEndpoint } from "../utilities";
import { LabeledMessageBaseSchema, SendResponseSchema, type LabeledMessageBase, type Message } from "./messages";

// Keep the deadline active through the response body. Query history and locks
// are handled by the caller; this client has no persistent state.
const INBOX_REQUEST_TIMEOUT_MS = 30_000;

export class InboxHTTP {
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

  async fetchPage(
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
      `${inboxUrl}/${type}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/cbor",
          ...(inboxToken
            ? { Authorization: `Bearer ${inboxToken}` }
            : {}),
        },
        body: cursor
          ? new Uint8Array(dagCborEncode({ cursor }))
          : body ?? new Uint8Array(dagCborEncode({})),
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
}
