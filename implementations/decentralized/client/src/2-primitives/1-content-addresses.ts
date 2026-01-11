import { sha256 } from "@noble/hashes/webcrypto.js";

export const CONTENT_ADDRESS_METHOD_SHA256 = "sha2-256";

// Multihash code and length for SHA2-256
// https://multiformats.io/multihash/#sha2-256---256-bits-aka-sha256
const MULTIHASH_CODE_SHA256 = 0x12;
const MULTIHASH_LENGTH_SHA256 = 32;

export class ContentAddresses {
  async register(
    contentAddressMethod: string,
    data: Uint8Array,
  ): Promise<Uint8Array> {
    if (contentAddressMethod !== CONTENT_ADDRESS_METHOD_SHA256) {
      throw new Error(
        `Unsupported content address method: ${contentAddressMethod}`,
      );
    }

    const hash = await sha256(data);

    const prefixedHash = new Uint8Array(2 + hash.length);
    prefixedHash[0] = MULTIHASH_CODE_SHA256;
    prefixedHash[1] = MULTIHASH_LENGTH_SHA256;
    prefixedHash.set(hash, 2);

    return prefixedHash;
  }

  async getMethod(contentAddress: Uint8Array): Promise<string> {
    if (
      contentAddress[0] === MULTIHASH_CODE_SHA256 &&
      contentAddress[1] === MULTIHASH_LENGTH_SHA256 &&
      contentAddress.length === 2 + MULTIHASH_LENGTH_SHA256
    ) {
      return CONTENT_ADDRESS_METHOD_SHA256;
    } else {
      throw new Error(`Unrecognized content address format.`);
    }
  }
}
