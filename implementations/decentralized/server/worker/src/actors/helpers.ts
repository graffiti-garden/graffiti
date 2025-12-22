import * as secp from "@noble/secp256k1";
import * as dagCbor from "@ipld/dag-cbor";
import { base58btc } from "multiformats/bases/base58";
import { base32 } from "multiformats/bases/base32";
import { base64url } from "multiformats/bases/base64";
import { CID } from "multiformats/cid";
import { create as createDigest } from "multiformats/hashes/digest";
import { sha256 } from "multiformats/hashes/sha2";

export function generateRotationKeyPair() {
  const secretKey = secp.utils.randomSecretKey();

  // Make sure the public key is compressed
  // with the right prefix and encodings according to:
  // https://atproto.com/specs/cryptography#public-key-encoding
  const publicKeyCompressed = secp.getPublicKey(
    secretKey,
    true, // compressed = true
  );
  if (publicKeyCompressed.length !== 33)
    throw new Error("Expected 33-byte compressed public key");
  const prefixed = new Uint8Array(2 + publicKeyCompressed.length);
  prefixed[0] = 0xe7;
  prefixed[1] = 0x01;
  prefixed.set(publicKeyCompressed, 2);

  const base58Encoded = base58btc.encode(prefixed); // includes leading 'z'
  const rotationKey = `did:key:${base58Encoded}`;

  return { secretKey, rotationKey };
}

async function hashOperation(operation: {}) {
  const operationBytes = dagCbor.encode(operation);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(operationBytes),
  );
  return new Uint8Array(digest);
}

export async function signOperation(
  unsignedOperation: {},
  secretKey: Uint8Array,
) {
  // Encode the operation as bytes
  const operationHash = await hashOperation(unsignedOperation);
  // Signatures must be "low-S", "compact"
  // and base64url-encoded
  // https://web.plc.directory/spec/v0.1/did-plc
  const signature = await secp.signAsync(operationHash, secretKey, {
    lowS: true,
    format: "compact",
    prehash: false,
  });
  // Remove the multibase prefix
  const sig = base64url.encode(signature).slice(1);
  return {
    ...unsignedOperation,
    sig,
  };
}

export async function deriveDid(signedOperation: {}) {
  // To derive the DID:
  // serialize the “signed” operation with DAG-CBOR,
  // take the SHA-256 hash of those bytes, and encode
  // the hash bytes in base32. use the first 24 characters
  // to generate DID value (did:plc:<hashchars>)
  // https://web.plc.directory/spec/v0.1/did-plc
  const operationHash = await hashOperation(signedOperation);
  const base32Encoded = base32.encode(operationHash).slice(1);
  const didSuffix = base32Encoded.slice(0, 24);
  return `did:plc:${didSuffix}`;
}

export async function deriveCid(signedOperation: {}) {
  const operationHash = await hashOperation(signedOperation);
  const digest = createDigest(sha256.code, operationHash);
  const cid = CID.createV1(dagCbor.code, digest);
  return cid.toString();
}
