import { describe, expect, test } from "vitest";
import {
  CONTENT_ADDRESS_METHOD_SHA256,
  ContentAddresses,
} from "./2-content-addresses";
import { randomBytes } from "@noble/hashes/utils.js";

export function contentAddressesTests() {
  const contentAddressMethods = [CONTENT_ADDRESS_METHOD_SHA256];
  const contentAddresses = new ContentAddresses();

  test("Invalid content address method", async () => {
    const bytes = randomBytes();
    await expect(() =>
      contentAddresses.register("invalid-method", bytes),
    ).rejects.toThrow();
  });

  for (const method of contentAddressMethods) {
    describe(`Content Address Method: ${method}`, () => {
      test("idempotent addresses", async () => {
        const bytes = randomBytes();
        const address1 = await contentAddresses.register(method, bytes);
        const address2 = await contentAddresses.register(method, bytes);
        expect(address1).toEqual(address2);
      });

      test("unique adddresses", async () => {
        const bytes1 = randomBytes();
        const bytes2 = randomBytes();
        const address1 = await contentAddresses.register(method, bytes1);
        const address2 = await contentAddresses.register(method, bytes2);
        expect(address1).not.toEqual(address2);
      });

      test("get method", async () => {
        const bytes = randomBytes();
        const address = await contentAddresses.register(method, bytes);
        const retrievedMethod = await contentAddresses.getMethod(address);
        expect(retrievedMethod).toEqual(method);
      });
    });
  }
}
