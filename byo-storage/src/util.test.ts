import { describe, it, expect } from "vitest";
import { randomBytes } from "@noble/hashes/utils";
import { base64Encode, base64Decode, encrypt, decrypt } from "./util";

describe("Utilities", () => {
  it("base64 encode and decode", () => {
    const data = randomBytes(100);
    const encoded = base64Encode(data);
    const decoded = base64Decode(encoded);
    expect(data.every((byte, i) => byte === decoded[i])).toBe(true);
  });

  it("encrypt and decrypt", () => {
    const passwordBytes = randomBytes(32);
    const password = base64Encode(passwordBytes);
    const data = randomBytes(100);
    const encrypted = encrypt(password, data);
    const decrypted = decrypt(password, encrypted);
    expect(data.every((byte, i) => byte === decrypted[i])).toBe(true);
  });

  it("encrypt and decrypt invalid", () => {
    const passwordBytes = randomBytes(32);
    const password = base64Encode(passwordBytes);
    const data = randomBytes(100);
    const encrypted = encrypt(password, data);

    const wrongPasswordBytes = randomBytes(32);
    const wrongPassword = base64Encode(wrongPasswordBytes);
    expect(() => decrypt(wrongPassword, encrypted)).toThrow(
      "Wrong password for this encrypted data",
    );
  });
});
