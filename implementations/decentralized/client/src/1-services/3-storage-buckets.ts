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

function batchWidth(maxBytes: number) {
  return Math.min(BATCH_KEYS, Math.floor(BATCH_TOTAL_VALUE_BYTES / maxBytes));
}

type PendingGet = {
  key: string;
  resolve: (value: Uint8Array) => void;
  reject: (reason: unknown) => void;
};
type BatchQueue = { requests: PendingGet[]; channel?: MessageChannel };

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
        } else if (!queue.channel) {
          // Timers can wait ~1 second in a hidden cross-origin iframe.
          // A message task still coalesces pending reads without that delay.
          queue.channel = new MessageChannel();
          queue.channel.port1.onmessage = () =>
            this.flush(storageBucketEndpoint, maxBytes, queue);
          queue.channel.port2.postMessage(null);
        }
      });
    }
    return this.getOne(storageBucketEndpoint, key, maxBytes);
  }

  private flush(endpoint: string, maxBytes: number, queue: BatchQueue) {
    // Closing both ports also cancels the queued task when a full batch
    // flushes synchronously, before its message is delivered.
    queue.channel?.port1.close();
    queue.channel?.port2.close();
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

    // Stream the body so that we can enforce maxBytes and halt the stream
    // if a malicious server gives us more than we are asking for.
    // The stream is only internal: callers just get one byte array
    // once the full read completes.
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Failed to read value from storage bucket");
    }

    // Allocate an array to store the chunks and count the
    // total number of bytes
    const chunks: Uint8Array[] = [];
    let total = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;
        if (!value || value.length === 0) continue;

        total += value.length;
        if (maxBytes !== undefined && total > maxBytes) {
          const error = new Error("Value exceeds maximum byte limit");
          // Start cancellation without delaying or replacing the size error.
          void reader.cancel(error).catch(() => {});
          throw error;
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
        url,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authorizationToken}`,
            "Content-Type": "application/cbor",
          },
          body: new Uint8Array(dagCborEncode(cursor ? { cursor } : {})),
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
