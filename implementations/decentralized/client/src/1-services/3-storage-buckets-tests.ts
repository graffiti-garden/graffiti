import { describe, expect, test } from "vitest";
import { StorageBuckets } from "./3-storage-buckets";
import { GraffitiErrorUnauthorized } from "./utilities";
import { GraffitiErrorNotFound } from "@graffiti-garden/api";

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
