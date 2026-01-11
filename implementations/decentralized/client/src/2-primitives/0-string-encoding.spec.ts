import { describe, expect, test } from "vitest";
import {
  STRING_ENCODER_METHOD_BASE64URL,
  StringEncoder,
} from "./0-string-encoding";
import { randomBytes } from "@noble/hashes/utils.js";

const stringEncodingMethods = [STRING_ENCODER_METHOD_BASE64URL];
const stringEncoder = new StringEncoder();

test("Invalid string decoding method", async () => {
  const bytes = randomBytes();
  await expect(() =>
    stringEncoder.encode("invalid-method", bytes),
  ).rejects.toThrow();
});

for (const method of stringEncodingMethods) {
  describe(`String Encoding Method: ${method}`, () => {
    test("encodes and decodes strings correctly", async () => {
      const bytes = randomBytes();
      const encoded = await stringEncoder.encode(method, bytes);
      const decoded = await stringEncoder.decode(encoded);

      expect(decoded).toEqual(bytes);
      expect(decoded).not.toEqual(randomBytes());
    });
  });
}
