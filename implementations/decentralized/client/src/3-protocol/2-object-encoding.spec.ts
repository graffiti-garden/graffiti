import { describe, expect, test } from "vitest";

import { encodeObjectUrl, decodeObjectUrl } from "./2-object-encoding.js";
import { randomBytes } from "@noble/hashes/utils.js";
import {
  STRING_ENCODER_METHOD_BASE64URL,
  StringEncoder,
} from "../2-primitives/0-string-encoding.js";

describe("object Urls", () => {
  for (const actor of [
    "did:plc:alsdkjfkdjf",
    "did:web:example.com/someone",
    "did:example:123456789abcdefghi👻",
  ]) {
    test(`encodeObjectUrl encodes and decodes correctly with actor: ${actor}`, async () => {
      const contentAddressBytes = randomBytes();
      const contentAddress = await new StringEncoder().encode(
        STRING_ENCODER_METHOD_BASE64URL,
        contentAddressBytes,
      );

      const url = encodeObjectUrl(actor, contentAddress);
      const decoded = decodeObjectUrl(url);
      expect(decoded.actor).toBe(actor);
      expect(decoded.contentAddress).toBe(contentAddress);
    });
  }

  for (const invalidUrl of [
    "http://example.com/not-an-object-url",
    "graffiti:",
    "graffiti:",
    "graffiti:no-content-address",
    "graffiti:too:many:parts",
  ]) {
    test(`Invalid Graffiti URL: ${invalidUrl}`, () => {
      expect(() => decodeObjectUrl(invalidUrl)).toThrow();
    });
  }
});
