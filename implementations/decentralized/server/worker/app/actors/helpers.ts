import * as secp from "@noble/secp256k1";
import * as dagCbor from "@ipld/dag-cbor";
import { base58btc } from "multiformats/bases/base58";
import { base32 } from "multiformats/bases/base32";
import { base64url } from "multiformats/bases/base64";
import { CID } from "multiformats/cid";
import { create as createDigest } from "multiformats/hashes/digest";
import { sha256 } from "multiformats/hashes/sha2";
import { z } from "zod";
import { HTTPException } from "hono/http-exception";
import {
  OptionalAlsoKnownAsSchema,
  OptionalServicesSchema,
} from "../../../shared/did-schemas";
import type { ContentfulStatusCode } from "hono/utils/http-status";

function generateRotationSecretKey() {
  return secp.utils.randomSecretKey();
}

export function deriveRotationPublicKey(secretKey: Uint8Array) {
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
  return `did:key:${base58Encoded}`;
}

export function generateRotationKeyPair() {
  const secretKey = generateRotationSecretKey();
  const rotationKey = deriveRotationPublicKey(secretKey);
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

async function signOperation(unsignedOperation: {}, secretKey: Uint8Array) {
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

async function deriveDid(signedOperation: {}) {
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

async function deriveCid(signedOperation: {}) {
  const operationHash = await hashOperation(signedOperation);
  const digest = createDigest(sha256.code, operationHash);
  const cid = CID.createV1(dagCbor.code, digest);
  return cid.toString();
}

export async function publishDid(args: {
  did?: string;
  alsoKnownAs: z.infer<typeof OptionalAlsoKnownAsSchema>;
  services: z.infer<typeof OptionalServicesSchema>;
  oldSecretKey: Uint8Array;
  newRotationKey: string;
  prev?: string;
}) {
  let { alsoKnownAs, services, oldSecretKey, newRotationKey, did, prev } = args;
  const unsignedOperation = {
    type: "plc_operation",
    rotationKeys: [newRotationKey],
    verificationMethods: {},
    alsoKnownAs: alsoKnownAs ?? [],
    services: services ?? {},
    prev: prev ?? null,
  };

  // Sign it
  const signedOperation = await signOperation(unsignedOperation, oldSecretKey);

  if (!did) {
    did = await deriveDid(signedOperation);
  }
  const cid = await deriveCid(signedOperation);

  // Publish the DID to the directory
  const result = await fetch(`https://plc.directory/${did}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(signedOperation),
  });
  if (!result.ok) {
    const { message } = (await result.json()) as { message: string };
    throw new HTTPException((result.status ?? 500) as ContentfulStatusCode, {
      message,
    });
  }

  return { did, cid };
}
