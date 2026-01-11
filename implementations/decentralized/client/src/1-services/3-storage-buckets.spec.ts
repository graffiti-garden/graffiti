import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { StorageBuckets } from "./3-storage-buckets";
import {
  GraffitiErrorForbidden,
  GraffitiErrorUnauthorized,
  testLogin,
  testLogout,
} from "./utilities";
import { GraffitiErrorNotFound } from "@graffiti-garden/api";

const storageBucketEndpoint =
  "https://graffiti.actor/s/uM2tE1r8c2rWMcvK05TXTwtyGkFn4n6yCK49rPIBWpw";

describe("Storage buckets", async () => {
  const token = await testLogin(storageBucketEndpoint);
  const storageBuckets = new StorageBuckets();

  afterAll(async () => {
    await testLogout(storageBucketEndpoint, token);
  });

  test("put, get, delete", async () => {
    const key = Math.random().toString(36).substring(2, 15);
    const input = "Hello world";
    const bytes = new TextEncoder().encode(input);

    await expect(
      storageBuckets.get(storageBucketEndpoint, key),
    ).rejects.toThrow(GraffitiErrorNotFound);

    await storageBuckets.put(storageBucketEndpoint, key, bytes, token);

    const resultBytes = await storageBuckets.get(
      storageBucketEndpoint,
      key,
      bytes.length,
    );
    const result = new TextDecoder().decode(resultBytes);
    expect(result).toEqual(input);

    await storageBuckets.delete(storageBucketEndpoint, key, token);

    await expect(
      storageBuckets.get(storageBucketEndpoint, key),
    ).rejects.toThrow(GraffitiErrorNotFound);
  });

  test("get with limit less than object", async () => {
    const key = Math.random().toString(36).substring(2, 15);
    const input = "Hello world";
    const bytes = new TextEncoder().encode(input);

    await storageBuckets.put(storageBucketEndpoint, key, bytes, token);

    await expect(
      storageBuckets.get(storageBucketEndpoint, key, bytes.length - 1),
    ).rejects.toThrow();
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

  test.skip("export", async () => {
    // Put a whole bunch of stuff so the export needs to page
    const keys = new Set<string>();
    for (let i = 0; i < 111; i++) {
      const key = Math.random().toString(36).substring(2, 15);
      keys.add(key);

      const input = "Hello world " + i;
      const bytes = new TextEncoder().encode(input);
      await storageBuckets.put(storageBucketEndpoint, key, bytes, token);
    }

    // Export
    const retrievedKeys = new Set<string>();
    const iterator = storageBuckets.export(storageBucketEndpoint, token);
    for await (const result of iterator) {
      if (keys.has(result.key)) {
        retrievedKeys.add(result.key);
      }
    }
    expect(retrievedKeys.size).toEqual(keys.size);

    // Delete all the keys
    for (const key of keys) {
      await storageBuckets.delete(storageBucketEndpoint, key, token);
    }
  }, 1000000);
});
