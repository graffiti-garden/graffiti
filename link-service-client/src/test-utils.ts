import { sha256 } from "@noble/hashes/sha256";
import {
  concatBytes,
  randomBytes,
  utf8ToBytes,
  bytesToHex,
} from "@noble/hashes/utils";
import { ed25519 as curve } from "@noble/curves/ed25519";

export function randomString(length: number = 64): string {
  return bytesToHex(randomBytes(length / 2));
}

export function soon(): number {
  return Math.ceil(Date.now() / 1000) + 100;
}

export function mockPublicKeyAndSignFromNonce(secret?: string) {
  const secretString = secret ?? randomString();
  const privateKeyFromNonce = (nonce: Uint8Array) =>
    sha256(concatBytes(nonce, utf8ToBytes(secretString)));
  return {
    publicKeyFromNonce(nonce: Uint8Array) {
      const sk = privateKeyFromNonce(nonce);
      return curve.getPublicKey(sk);
    },
    signFromNonce(message: Uint8Array, nonce: Uint8Array) {
      const sk = privateKeyFromNonce(nonce);
      return curve.sign(message, sk);
    },
  };
}
