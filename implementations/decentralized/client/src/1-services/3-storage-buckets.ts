import {
  fetchWithErrorHandling,
  getAuthorizationEndpoint,
  verifyHTTPSEndpoint,
} from "./utilities";
import z from "zod";

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
      body: value.slice().buffer,
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

    const contentLengthHeader = response.headers.get("Content-Length");
    if (!contentLengthHeader) {
      throw new Error("Missing Content-Length header in response");
    }
    const contentLength = contentLengthHeader
      ? Number(contentLengthHeader)
      : undefined;
    if (
      !contentLength ||
      !Number.isFinite(contentLength) ||
      contentLength < 0
    ) {
      throw new Error("Invalid Content-Length header in response");
    }
    if (maxBytes && contentLength > maxBytes) {
      throw new Error("Value exceeds maximum byte limit");
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Failed to read value from storage bucket");
    }

    // Stream the bytes
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
        if (!value) continue;

        offset += value.length;
        if (offset > out.length) {
          throw new Error("Received more data than expected");
        }

        out.set(value, offset - value.length);
      }
    } finally {
      // Make sure we release the stream lock promptly
      reader.releaseLock();
    }

    if (!completed) {
      throw new Error("Failed to read complete value from storage bucket");
    }

    return offset === contentLength ? out : out.slice(0, offset);
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

      const json = await response.json();
      const data = ExportSchema.parse(json);

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

const ExportSchema = z.object({
  keys: z.array(z.string()),
  cursor: z.string().nullable().optional(),
});
