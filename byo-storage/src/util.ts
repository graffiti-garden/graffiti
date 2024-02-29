import { randomBytes, concatBytes } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { xchacha20poly1305 as cipher } from "@noble/ciphers/chacha";

export function base64Encode(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCodePoint(...bytes));
  // Make sure it is url safe
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/\=+$/, "");
}

export function base64Decode(base64: string): Uint8Array {
  base64 = base64.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 != 0) {
    base64 += "=";
  }
  return new Uint8Array(Array.from(atob(base64), (s) => s.codePointAt(0) ?? 0));
}

export function encrypt(password: string, data: Uint8Array): Uint8Array {
  const cipherKey = sha256(password);
  const cipherNonce = randomBytes(24);
  const encrypted = cipher(cipherKey, cipherNonce).encrypt(data);
  return concatBytes(cipherNonce, encrypted);
}

export function decrypt(password: string, encrypted: Uint8Array): Uint8Array {
  const cipherKey = sha256(password);
  const cipherNonce = encrypted.slice(0, 24);
  const cipherData = cipher(cipherKey, cipherNonce);
  let decrypted: Uint8Array;
  try {
    decrypted = cipherData.decrypt(encrypted.slice(24));
  } catch (e) {
    if (e.message == "invalid tag") {
      throw "Wrong password for this encrypted data";
    } else {
      throw e;
    }
  }
  return decrypted;
}
