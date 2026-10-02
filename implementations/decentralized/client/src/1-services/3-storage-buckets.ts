import {
  fetchWithErrorHandling,
  getAuthorizationEndpoint,
  verifyHTTPSEndpoint,
} from "./utilities";
import { string, array, object, optional, nullable } from "zod/mini";
import { encode as dagCborEncode, decode as dagCborDecode } from "@ipld/dag-cbor";
import { GraffitiErrorNotFound, GraffitiErrorTooLarge } from "@graffiti-garden/api";

// All batch-capable bucket servers accept these transport limits.
const BATCH_KEYS = 32; // total number of keys in a batch request
const BATCH_TOTAL_VALUE_BYTES = 1024 * 1024; // total response limit

// This is a heuristic for how long to wait to fill a batch request
// before sending it. Just enough waiting to capture a few more requests,
// but not so long that it adds noticeable latency.
const BATCH_WAIT_MS = 2;

function batchWidth(maxBytes: number) {
  return Math.min(BATCH_KEYS, Math.floor(BATCH_TOTAL_VALUE_BYTES / maxBytes));
}

type PendingGet = {
  key: string;
  resolve: (value: Uint8Array) => void;
  reject: (reason: unknown) => void;
};
type BatchQueue = { requests: PendingGet[]; timer?: ReturnType<typeof setTimeout> };

export class StorageBuckets {
  getAuthorizationEndpoint = getAuthorizationEndpoint;
  private readonly queues = new Map<string, Map<number, BatchQueue>>();
  private readonly unsupportedBatchEndpoints = new Set<string>();

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
    if (
      maxBytes !== undefined &&
      Number.isSafeInteger(maxBytes) &&
      maxBytes > 0 &&
      batchWidth(maxBytes) >= 2 &&
      !this.unsupportedBatchEndpoints.has(storageBucketEndpoint)
    ) {
      return new Promise<Uint8Array>((resolve, reject) => {
        let queuesByMaxBytes = this.queues.get(storageBucketEndpoint);
        if (!queuesByMaxBytes) {
          queuesByMaxBytes = new Map();
          this.queues.set(storageBucketEndpoint, queuesByMaxBytes);
        }
        let queue = queuesByMaxBytes.get(maxBytes);
        if (!queue) {
          queue = { requests: [] };
          queuesByMaxBytes.set(maxBytes, queue);
        }
        queue.requests.push({ key, resolve, reject });
        if (queue.requests.length === batchWidth(maxBytes)) {
          this.flush(storageBucketEndpoint, maxBytes, queue);
        } else if (queue.timer === undefined) {
          queue.timer = setTimeout(
            () => this.flush(storageBucketEndpoint, maxBytes, queue),
            BATCH_WAIT_MS,
          );
        }
      });
    }
    return this.getOne(storageBucketEndpoint, key, maxBytes);
  }

  private flush(endpoint: string, maxBytes: number, queue: BatchQueue) {
    if (queue.timer !== undefined) clearTimeout(queue.timer);
    const requests = queue.requests;
    const queuesByMaxBytes = this.queues.get(endpoint)!;
    queuesByMaxBytes.delete(maxBytes);
    if (queuesByMaxBytes.size === 0) this.queues.delete(endpoint);
    if (requests.length === 1 || this.unsupportedBatchEndpoints.has(endpoint)) {
      requests.forEach(({ key, resolve, reject }) => {
        void this.getOne(endpoint, key, maxBytes).then(resolve, reject);
      });
    } else {
      void this.getBatch(endpoint, maxBytes, requests);
    }
  }

  private async getBatch(endpoint: string, maxBytes: number, requests: PendingGet[]) {
    try {
      const response = await fetch(`${endpoint}/values`, {
        method: "POST",
        headers: { "Content-Type": "application/cbor", Accept: "application/cbor" },
        body: dagCborEncode({
          keys: requests.map(({ key }) => key),
          maxValueBytes: maxBytes,
        }).slice(),
      });
      if (response.status === 404) {
        // An older bucket server has no /values route but still serves GETs.
        this.unsupportedBatchEndpoints.add(endpoint);
        await Promise.all(requests.map(async ({ key, resolve, reject }) => {
          try {
            resolve(await this.getOne(endpoint, key, maxBytes));
          } catch (error) {
            reject(error);
          }
        }));
        return;
      }
      if (!response.ok) throw new Error(await response.text());
      const decoded = dagCborDecode(await response.arrayBuffer());
      if (
        !decoded || typeof decoded !== "object" ||
        !("results" in decoded) || !Array.isArray(decoded.results) ||
        decoded.results.length !== requests.length
      ) throw new Error("Invalid storage batch response");

      decoded.results.forEach((result: unknown, index: number) => {
        const { resolve, reject } = requests[index];
        if (!result || typeof result !== "object" || !("status" in result)) {
          reject(new Error("Invalid storage batch result"));
        } else if (
          result.status === 200 && "value" in result &&
          result.value instanceof Uint8Array &&
          result.value.byteLength <= maxBytes
        ) {
          resolve(result.value);
        } else if (result.status === 404) {
          reject(new GraffitiErrorNotFound("Value not found"));
        } else if (result.status === 413) {
          reject(new GraffitiErrorTooLarge("Value exceeds maximum byte limit"));
        } else {
          reject(new Error("Invalid storage batch result"));
        }
      });
    } catch (error) {
      requests.forEach(({ reject }) => reject(error));
    }
  }

  private async getOne(
    storageBucketEndpoint: string,
    key: string,
    maxBytes?: number,
  ): Promise<Uint8Array> {
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
