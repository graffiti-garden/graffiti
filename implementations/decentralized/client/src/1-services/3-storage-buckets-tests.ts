import { describe, expect, test } from "vitest";
import { StorageBuckets } from "./3-storage-buckets";
import { GraffitiErrorUnauthorized } from "./utilities";
import { GraffitiErrorNotFound, GraffitiErrorTooLarge } from "@graffiti-garden/api";
import { encode as dagCborEncode, decode as dagCborDecode } from "@ipld/dag-cbor";

export function storageBucketTests(
  storageBucketEndpoint: string,
  storageBucketToken: string,
) {
  describe("Storage buckets", async () => {
    const storageBuckets = new StorageBuckets();

    test("put, get, delete", async () => {
      const key = Math.random().toString(36).substring(2, 15);
      const input = "Hello world";
      const bytes = new TextEncoder().encode(input);

      await expect(
        storageBuckets.get(storageBucketEndpoint, key),
      ).rejects.toThrow(GraffitiErrorNotFound);

      await storageBuckets.put(
        storageBucketEndpoint,
        key,
        bytes,
        storageBucketToken,
      );

      const resultBytes = await storageBuckets.get(
        storageBucketEndpoint,
        key,
        bytes.length,
      );
      const result = new TextDecoder().decode(resultBytes);
      expect(result).toEqual(input);

      await storageBuckets.delete(
        storageBucketEndpoint,
        key,
        storageBucketToken,
      );

      await expect(
        storageBuckets.get(storageBucketEndpoint, key),
      ).rejects.toThrow(GraffitiErrorNotFound);
    });

    test("get with limit less than object", async () => {
      const key = Math.random().toString(36).substring(2, 15);
      const input = "Hello world";
      const bytes = new TextEncoder().encode(input);

      await storageBuckets.put(
        storageBucketEndpoint,
        key,
        bytes,
        storageBucketToken,
      );

      await expect(
        storageBuckets.get(storageBucketEndpoint, key, bytes.length - 1),
      ).rejects.toThrow();
    });

    test("overwrites across the small and large storage cutoff", async () => {
      const key = crypto.randomUUID();
      const small = new Uint8Array([1, 2, 3]);
      const large = new Uint8Array(32 * 1024 + 1).fill(42);
      const otherLarge = new Uint8Array(32 * 1024 + 1).fill(43);

      await storageBuckets.put(storageBucketEndpoint, key, large, storageBucketToken);
      expect(await storageBuckets.get(storageBucketEndpoint, key)).toEqual(large);

      await storageBuckets.put(storageBucketEndpoint, key, otherLarge, storageBucketToken);
      expect(await storageBuckets.get(storageBucketEndpoint, key)).toEqual(otherLarge);

      await storageBuckets.put(storageBucketEndpoint, key, small, storageBucketToken);
      expect(await storageBuckets.get(storageBucketEndpoint, key)).toEqual(small);

      await storageBuckets.put(storageBucketEndpoint, key, large, storageBucketToken);
      expect(await storageBuckets.get(storageBucketEndpoint, key)).toEqual(large);

      await storageBuckets.delete(storageBucketEndpoint, key, storageBucketToken);
      await expect(storageBuckets.get(storageBucketEndpoint, key)).rejects.toThrow(
        GraffitiErrorNotFound,
      );
    });

    test("batch reads arbitrary keys from one bucket", async () => {
      const first = crypto.randomUUID();
      const second = crypto.randomUUID();
      const missing = crypto.randomUUID();
      const small = new Uint8Array([1, 2, 3]);
      const large = new Uint8Array(32 * 1024 + 1).fill(7);
      await storageBuckets.put(storageBucketEndpoint, first, small, storageBucketToken);
      await storageBuckets.put(storageBucketEndpoint, second, large, storageBucketToken);
      try {
        const response = await fetch(`${storageBucketEndpoint}/values`, {
          method: "POST",
          headers: { "Content-Type": "application/cbor" },
          body: dagCborEncode({
            keys: [first, missing, second, first],
            maxValueBytes: small.length,
          }).slice(),
        });
        expect(response.status).toBe(200);
        const decoded = dagCborDecode(await response.arrayBuffer()) as {
          results: Array<{ status: number; value?: Uint8Array; etag?: string }>;
        };
        expect(decoded.results.map(({ status }) => status)).toEqual([200, 404, 413, 200]);
        expect(decoded.results[0].value).toEqual(small);
        expect(decoded.results[0].etag).toBeTypeOf("string");
        expect(decoded.results[3].value).toEqual(small);
        const largeResponse = await fetch(`${storageBucketEndpoint}/values`, {
          method: "POST",
          headers: { "Content-Type": "application/cbor" },
          body: dagCborEncode({
            keys: [second],
            maxValueBytes: large.length,
          }).slice(),
        });
        expect(largeResponse.status).toBe(200);
        const largeDecoded = dagCborDecode(await largeResponse.arrayBuffer()) as {
          results: Array<{ status: number; value?: Uint8Array }>;
        };
        expect(largeDecoded.results[0].value).toEqual(large);

        const oversizedResponse = await fetch(`${storageBucketEndpoint}/values`, {
          method: "POST",
          headers: { "Content-Type": "application/cbor" },
          body: dagCborEncode({
            keys: [first, second],
            maxValueBytes: 1024 * 1024,
          }).slice(),
        });
        expect(oversizedResponse.status).toBe(400);

        const settled = await Promise.allSettled([
          storageBuckets.get(storageBucketEndpoint, first, small.length),
          storageBuckets.get(storageBucketEndpoint, missing, small.length),
          storageBuckets.get(storageBucketEndpoint, second, small.length),
        ]);
        expect(settled[0]).toEqual({ status: "fulfilled", value: small });
        expect(settled[1].status).toBe("rejected");
        expect((settled[1] as PromiseRejectedResult).reason).toBeInstanceOf(GraffitiErrorNotFound);
        expect(settled[2].status).toBe("rejected");
        expect((settled[2] as PromiseRejectedResult).reason).toBeInstanceOf(GraffitiErrorTooLarge);
        expect(await storageBuckets.get(storageBucketEndpoint, second)).toEqual(large);
      } finally {
        await storageBuckets.delete(storageBucketEndpoint, first, storageBucketToken);
        await storageBuckets.delete(storageBucketEndpoint, second, storageBucketToken);
      }
    });

    test("accepts a full batch of maximum-length Unicode keys", async () => {
      const key = "界".repeat(255);
      const body = dagCborEncode({
        keys: Array(32).fill(key),
        maxValueBytes: 0,
      }).slice();
      expect(body.byteLength).toBeGreaterThan(16 * 1024);
      const response = await fetch(`${storageBucketEndpoint}/values`, {
        method: "POST",
        headers: { "Content-Type": "application/cbor" },
        body,
      });
      expect(response.status).toBe(200);
      const decoded = dagCborDecode(await response.arrayBuffer()) as {
        results: Array<{ status: number }>;
      };
      expect(decoded.results.map(({ status }) => status)).toEqual(Array(32).fill(404));
    });

    test("concurrent bounded gets share one batch", async () => {
      const keys = Array.from({ length: 3 }, () => crypto.randomUUID());
      const values = keys.map((_, i) => new Uint8Array([i + 1]));
      for (let i = 0; i < keys.length; i++) {
        await storageBuckets.put(storageBucketEndpoint, keys[i], values[i], storageBucketToken);
      }
      const originalFetch = globalThis.fetch;
      const calls: string[] = [];
      globalThis.fetch = (input, init) => {
        const request = new Request(input, init);
        calls.push(`${request.method} ${request.url}`);
        return originalFetch(input, init);
      };
      try {
        expect(await Promise.all(keys.map((key) =>
          storageBuckets.get(storageBucketEndpoint, key, 1),
        ))).toEqual(values);
        expect(calls.filter((call) => call === `POST ${storageBucketEndpoint}/values`)).toHaveLength(1);
        expect(calls.filter((call) => call.includes("/value/"))).toHaveLength(0);
      } finally {
        globalThis.fetch = originalFetch;
        for (const key of keys) {
          await storageBuckets.delete(storageBucketEndpoint, key, storageBucketToken);
        }
      }
    });

    test("falls back to GET when a bucket server does not support batches", async () => {
      const keys = Array.from({ length: 2 }, () => crypto.randomUUID());
      const value = new Uint8Array([42]);
      for (const key of keys) {
        await storageBuckets.put(storageBucketEndpoint, key, value, storageBucketToken);
      }
      const originalFetch = globalThis.fetch;
      let batchAttempts = 0;
      globalThis.fetch = (input, init) => {
        const request = new Request(input, init);
        if (request.method === "POST" && request.url === `${storageBucketEndpoint}/values`) {
          batchAttempts++;
          return Promise.resolve(new Response("Not found", { status: 404 }));
        }
        return originalFetch(input, init);
      };
      try {
        const legacyBuckets = new StorageBuckets();
        expect(await Promise.all(keys.map((key) =>
          legacyBuckets.get(storageBucketEndpoint, key, 1),
        ))).toEqual([value, value]);
        expect(await Promise.all(keys.map((key) =>
          legacyBuckets.get(storageBucketEndpoint, key, 1),
        ))).toEqual([value, value]);
        expect(batchAttempts).toBe(1);
      } finally {
        globalThis.fetch = originalFetch;
        for (const key of keys) {
          await storageBuckets.delete(storageBucketEndpoint, key, storageBucketToken);
        }
      }
    });

    test("a batch error does not disable batching or fall back to GET", async () => {
      const originalFetch = globalThis.fetch;
      let batchAttempts = 0;
      let getAttempts = 0;
      globalThis.fetch = (input, init) => {
        const request = new Request(input, init);
        if (request.method === "POST") {
          batchAttempts++;
          return Promise.resolve(new Response("Batch limit exceeded", { status: 413 }));
        }
        getAttempts++;
        return originalFetch(input, init);
      };
      try {
        const buckets = new StorageBuckets();
        const readPair = () => Promise.all([
          buckets.get(storageBucketEndpoint, "a", 1),
          buckets.get(storageBucketEndpoint, "b", 1),
        ]);
        await expect(readPair()).rejects.toThrow("Batch limit exceeded");
        await expect(readPair()).rejects.toThrow("Batch limit exceeded");
        expect(batchAttempts).toBe(2);
        expect(getAttempts).toBe(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("unauthorized", async () => {
      const key = Math.random().toString(36).substring(2, 15);
      const input = "Hello world";
      const bytes = new TextEncoder().encode(input);

      await expect(
        storageBuckets.put(storageBucketEndpoint, key, bytes, "invalid-token"),
      ).rejects.toThrow(GraffitiErrorUnauthorized);
      await expect(
        storageBuckets.delete(storageBucketEndpoint, key, "invalid-token"),
      ).rejects.toThrow(GraffitiErrorUnauthorized);
      await expect(
        storageBuckets.export(storageBucketEndpoint, "invalid-token").next(),
      ).rejects.toThrow(GraffitiErrorUnauthorized);
    });

    test("export", async () => {
      // Put a whole bunch of stuff so the export needs to page
      const keys = new Set<string>();
      for (let i = 0; i < 256; i++) {
        const key = Math.random().toString(36).substring(2, 15);
        keys.add(key);

        const input = "Hello world " + i;
        const bytes = new TextEncoder().encode(input);
        await storageBuckets.put(
          storageBucketEndpoint,
          key,
          bytes,
          storageBucketToken,
        );
      }

      // Export
      const retrievedKeys = new Set<string>();
      const iterator = storageBuckets.export(
        storageBucketEndpoint,
        storageBucketToken,
      );
      for await (const result of iterator) {
        if (keys.has(result.key)) {
          retrievedKeys.add(result.key);
        }
      }
      expect(retrievedKeys.size).toEqual(keys.size);

      // Delete all the keys
      for (const key of keys) {
        await storageBuckets.delete(
          storageBucketEndpoint,
          key,
          storageBucketToken,
        );
      }
    }, 1000000);
  });
}
