import { describe, expect, test } from "vitest";
import {
  ALLOWED_ATTESTATION_METHOD_HMAC_SHA256,
  AllowedAttestations,
} from "./4-allowed-attestations";
import { randomBytes } from "@noble/hashes/utils.js";
import {
  StringEncoder,
  STRING_ENCODER_METHOD_BASE64URL,
} from "./1-string-encoding";

export function allowedAttestationTests() {
  describe("Allowed Attestation Tests", () => {
    const allowedAttestationMethods = [ALLOWED_ATTESTATION_METHOD_HMAC_SHA256];
    const allowedAttestations = new AllowedAttestations();

    async function randomActor() {
      const bytes = randomBytes();
      const str = await new StringEncoder().encode(
        STRING_ENCODER_METHOD_BASE64URL,
        bytes,
      );
      return `did:web:${str}.com`;
    }

    test("Invalid attestation method", async () => {
      const actor = await randomActor();
      await expect(() =>
        allowedAttestations.attest("invalid-method", actor),
      ).rejects.toThrow();
    });

    for (const method of allowedAttestationMethods) {
      describe(`Attestation Method: ${method}`, () => {
        test("Valid attestation", async () => {
          const actor = await randomActor();
          const { attestation, ticket } = await allowedAttestations.attest(
            method,
            actor,
          );
          const isValid = await allowedAttestations.validate(
            attestation,
            actor,
            ticket,
          );
          expect(isValid).toBe(true);
        });

        test("Wrong actor", async () => {
          const actor = await randomActor();
          const { attestation, ticket } = await allowedAttestations.attest(
            method,
            actor,
          );
          const otherActor = await randomActor();
          const isValid = await allowedAttestations.validate(
            attestation,
            otherActor,
            ticket,
          );
          expect(isValid).toBe(false);
        });

        test("Wrong ticket", async () => {
          const actor = await randomActor();
          const { attestation: attestation1, ticket: ticket1 } =
            await allowedAttestations.attest(method, actor);
          const { attestation: attestation2, ticket: ticket2 } =
            await allowedAttestations.attest(method, actor);
          const isValid1 = await allowedAttestations.validate(
            attestation1,
            actor,
            ticket2,
          );
          const isValid2 = await allowedAttestations.validate(
            attestation2,
            actor,
            ticket1,
          );
          expect(isValid1).toBe(false);
          expect(isValid2).toBe(false);
        });
      });
    }
  });
}
