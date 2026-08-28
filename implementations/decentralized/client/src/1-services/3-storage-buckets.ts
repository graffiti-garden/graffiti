import {
  fetchWithErrorHandling,
  getAuthorizationEndpoint,
  verifyHTTPSEndpoint,
} from "./utilities";
import { string, array, object, optional, nullable } from "zod/mini";
import { decode as dagCborDecode } from "@ipld/dag-cbor";

export class StorageBuckets {
  getAuthorizationEndpoint = getAuthorizationEndpoint;

  async put(
    storageBucketEndpoint: string,
    key: string,
    value: Uint8Array,
    authorizationToken: string,
  ): Promise<void> {
    verifyHTTPSEndpoint(storageBucketEndpoint);
    const url = `${storageBucketEndpoint}/value/${encodeURIComponent(key)}`;

    await fetchWithErrorHandling(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        Authorization: `Bearer ${authorizationToken}`,
      },
      body: value.slice(),
    });
  }

  async delete(
    storageBucketEndpoint: string,
    key: string,
    authorizationToken: string,
  ): Promise<void> {
    verifyHTTPSEndpoint(storageBucketEndpoint);
    const url = `${storageBucketEndpoint}/value/${encodeURIComponent(key)}`;

    await fetchWithErrorHandling(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${authorizationToken}`,
      },
    });
  }

  async get(
    storageBucketEndpoint: string,
    key: string,
    maxBytes?: number,
  ): Promise<Uint8Array> {
    verifyHTTPSEndpoint(storageBucketEndpoint);
    const url = `${storageBucketEndpoint}/value/${encodeURIComponent(key)}`;

    const response = await fetchWithErrorHandling(url);

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Failed to read value from storage bucket");
    }

    const contentLengthHeader = response.headers.get("Content-Length");
    const parsedContentLength = contentLengthHeader
      ? Number(contentLengthHeader)
      : undefined;

    const hasValidContentLength =
      !!parsedContentLength &&
      !!Number.isFinite(parsedContentLength) &&
      parsedContentLength >= 0;

    // Fast path: Content-Length exists and is valid
    if (hasValidContentLength) {
      const contentLength = parsedContentLength!;
      if (maxBytes !== undefined && contentLength > maxBytes) {
        throw new Error("Value exceeds maximum byte limit");
      }

      const out = new Uint8Array(contentLength);
      let offset = 0;
      let completed = false;

      try {
        while (offset <= out.length) {
          const { done, value } = await reader.read();

          if (done) {
            completed = true;
            break;
          }
          if (!value || value.length === 0) continue;

          const nextOffset = offset + value.length;
          if (nextOffset > out.length) {
            throw new Error("Received more data than expected");
          }

          out.set(value, offset);
          offset = nextOffset;
        }
      } finally {
        reader.releaseLock();
      }

      if (!completed) {
        throw new Error("Failed to read complete value from storage bucket");
      }

      return offset === contentLength ? out : out.slice(0, offset);
    }

    // Fallback path: no (usable) Content-Length
    const chunks: Uint8Array[] = [];
    let total = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;
        if (!value || value.length === 0) continue;

        total += value.length;
        if (maxBytes !== undefined && total > maxBytes) {
          throw new Error("Value exceeds maximum byte limit");
        }

        // Copy because some implementations reuse the underlying buffer
        chunks.push(value.slice());
      }
    } finally {
      reader.releaseLock();
    }

    // Concatenate chunks into one Uint8Array
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }

  async *export(
    storageBucketEndpoint: string,
    authorizationToken: string,
  ): AsyncGenerator<{ key: string }> {
    verifyHTTPSEndpoint(storageBucketEndpoint);
    const url = `${storageBucketEndpoint}/export`;

    let cursor: string | undefined = undefined;
    while (true) {
      const response = await fetchWithErrorHandling(
        cursor ? `${url}?cursor=${encodeURIComponent(cursor)}` : url,
        {
          headers: {
            Authorization: `Bearer ${authorizationToken}`,
          },
        },
      );

      const blob = await response.blob();
      const cbor = dagCborDecode(await blob.arrayBuffer());
      const data = ExportSchema.parse(cbor);

      for (const key of data.keys) {
        yield { key };
      }

      if (data.cursor) {
        cursor = data.cursor;
      } else {
        break;
      }
    }
  }
}

const ExportSchema = object({
  keys: array(string()),
  cursor: optional(nullable(string())),
});
