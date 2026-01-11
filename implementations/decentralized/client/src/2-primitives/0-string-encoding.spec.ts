import { describe, expect, test } from "vitest";
import {
  STRING_ENCODER_METHOD_BASE64URL,
  StringEncoder,
} from "./0-string-encoding";
import { randomBytes } from "@noble/hashes/utils.js";

console.log(STRING_ENCODER_METHOD_BASE64URL);
const stringEncodingMethods = [STRING_ENCODER_METHOD_BASE64URL];
const stringEncoder = new StringEncoder();

test("Invalid string decoding method", () => {
  const bytes = randomBytes();
  expect(() => stringEncoder.encode("invalid-method", bytes)).toThrow();
});

for (const method of stringEncodingMethods) {
  describe(`String Encoding Method: ${method}`, () => {
    test("encodes and decodes strings correctly", () => {
      const bytes = randomBytes();
      const encoded = stringEncoder.encode(method, bytes);
      const decoded = stringEncoder.decode(encoded);

      expect(decoded).toEqual(bytes);
      expect(decoded).not.toEqual(randomBytes());
    });
  });
}
