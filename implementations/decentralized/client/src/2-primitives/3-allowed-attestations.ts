import { sha256, hmac } from "@noble/hashes/webcrypto.js";
import { randomBytes } from "@noble/hashes/utils.js";

const ALLOWED_ATTESTATION_METHOD_SHA256 = "hmac:sha2-256";
const ALLOWED_ATTESTATION_METHOD_PREFIX_SHA256 = 0;

export class AllowedAttestations {
  async attest(
    allowedAttestationMethod: string,
    actor: string,
  ): Promise<{
    attestation: Uint8Array;
    ticket: Uint8Array;
  }> {
    if (allowedAttestationMethod !== ALLOWED_ATTESTATION_METHOD_SHA256) {
      throw new Error(
        `Unsupported allowed attestation method: ${allowedAttestationMethod}`,
      );
    }

    const ticket = randomBytes(32);
    const attestation = await hmac(
      sha256,
      ticket,
      new TextEncoder().encode(actor),
    );

    const prefixedTicket = new Uint8Array(ticket.length + 1);
    prefixedTicket[0] = ALLOWED_ATTESTATION_METHOD_PREFIX_SHA256;
    prefixedTicket.set(ticket, 1);

    return { attestation, ticket: prefixedTicket };
  }

  async validate(
    attestation: Uint8Array,
    actor: string,
    ticket: Uint8Array,
  ): Promise<boolean> {
    const prefix = ticket[0];
    if (prefix !== ALLOWED_ATTESTATION_METHOD_PREFIX_SHA256) {
      throw new Error(
        `Unrecognized allowed attestation method prefix: ${prefix}`,
      );
    }

    const expected = await hmac(
      sha256,
      ticket.slice(1),
      new TextEncoder().encode(actor),
    );

    if (attestation.length !== expected.length) {
      return false;
    }

    return expected.every((b, i) => attestation[i] === b);
  }
}
