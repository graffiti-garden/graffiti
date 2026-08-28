import { sha256, hmac } from "@noble/hashes/webcrypto.js";
import { randomBytes } from "@noble/hashes/utils.js";
import {
  MULTIHASH_CODE_SHA256,
  MULTIHASH_LENGTH_SHA256,
} from "./2-content-addresses";

export const ALLOWED_ATTESTATION_METHOD_HMAC_SHA256 = "hmac:sha2-256";
const ALLOWED_ATTESTATION_METHOD_PREFIX_HMAC = 0;

export class AllowedAttestations {
  async attest(
    allowedAttestationMethod: string,
    actor: string,
  ): Promise<{
    attestation: Uint8Array;
    ticket: Uint8Array;
  }> {
    if (allowedAttestationMethod !== ALLOWED_ATTESTATION_METHOD_HMAC_SHA256) {
      throw new Error(
        `Unsupported allowed attestation method: ${allowedAttestationMethod}`,
      );
    }

    const ticket = randomBytes();
    const attestation = await hmac(
      sha256,
      ticket,
      new TextEncoder().encode(actor),
    );

    const prefixedTicket = new Uint8Array(ticket.length + 3);
    prefixedTicket[0] = ALLOWED_ATTESTATION_METHOD_PREFIX_HMAC;
    prefixedTicket[1] = MULTIHASH_CODE_SHA256;
    prefixedTicket[2] = MULTIHASH_LENGTH_SHA256;
    prefixedTicket.set(ticket, 3);

    return { attestation, ticket: prefixedTicket };
  }

  async validate(
    attestation: Uint8Array,
    actor: string,
    ticket: Uint8Array,
  ): Promise<boolean> {
    const typePrefix = ticket[0];
    const hashPrefix = ticket[1];
    const lengthPrefix = ticket[2];
    if (
      typePrefix !== ALLOWED_ATTESTATION_METHOD_PREFIX_HMAC ||
      hashPrefix !== MULTIHASH_CODE_SHA256 ||
      lengthPrefix !== MULTIHASH_LENGTH_SHA256
    ) {
      throw new Error(`Unrecognized allowed ticket format`);
    }

    const expected = await hmac(
      sha256,
      ticket.slice(3),
      new TextEncoder().encode(actor),
    );

    // Make sure the bytes are exactly equal
    if (attestation.length !== expected.length) {
      return false;
    }
    return expected.every((b, i) => attestation[i] === b);
  }
}
