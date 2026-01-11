import { describe, expect, test } from "vitest";
import {
  CHANNEL_ATTESTATION_METHOD_SHA256_ED25519,
  ChannelAttestations,
} from "./2-channel-attestations";
import { randomBytes } from "@noble/hashes/utils.js";
import {
  StringEncoder,
  STRING_ENCODER_METHOD_BASE64URL,
} from "./0-string-encoding";

const allowedAttestationMethods = [CHANNEL_ATTESTATION_METHOD_SHA256_ED25519];
const channelAttestations = new ChannelAttestations();

async function randomActor() {
  const bytes = randomBytes();
  const str = await new StringEncoder().encode(
    STRING_ENCODER_METHOD_BASE64URL,
    bytes,
  );
  return `did:web:${str}.com`;
}
async function randomChannel() {
  const bytes = randomBytes();
  return await new StringEncoder().encode(
    STRING_ENCODER_METHOD_BASE64URL,
    bytes,
  );
}

test("Invalid attestation method", async () => {
  const actor = await randomActor();
  await expect(() =>
    channelAttestations.register("invalid-method", actor),
  ).rejects.toThrow();
});

for (const method of allowedAttestationMethods) {
  describe(`Attestation Method: ${method}`, () => {
    test("Idempotent public Ids", async () => {
      const channel = await randomChannel();
      const publicId1 = await channelAttestations.register(method, channel);
      const publicId2 = await channelAttestations.register(method, channel);
      expect(publicId1).toEqual(publicId2);
    });

    test("Unique public ids", async () => {
      const channel1 = await randomChannel();
      const channel2 = await randomChannel();
      const publicId1 = await channelAttestations.register(method, channel1);
      const publicId2 = await channelAttestations.register(method, channel2);
      expect(publicId1).not.toEqual(publicId2);
    });

    test("Valid attestation", async () => {
      const actor = await randomActor();
      const channel = await randomChannel();
      const { attestation, channelPublicId } = await channelAttestations.attest(
        method,
        actor,
        channel,
      );
      const isValid = await channelAttestations.validate(
        attestation,
        actor,
        channelPublicId,
      );
      expect(isValid).toBe(true);
    });

    test("Invalid attestation with wrong actor", async () => {
      const actor = await randomActor();
      const wrongActor = await randomActor();
      const channel = await randomChannel();
      const { attestation, channelPublicId } = await channelAttestations.attest(
        method,
        actor,
        channel,
      );
      const isValid = await channelAttestations.validate(
        attestation,
        wrongActor,
        channelPublicId,
      );
      expect(isValid).toBe(false);
    });

    test("Invalid attestation with wrong channel", async () => {
      const actor = await randomActor();
      const channel = await randomChannel();
      const wrongChannel = await randomChannel();
      const { attestation, channelPublicId } = await channelAttestations.attest(
        method,
        actor,
        channel,
      );
      const wrongChannelPublicId = await channelAttestations.register(
        method,
        wrongChannel,
      );
      const isValid = await channelAttestations.validate(
        attestation,
        actor,
        wrongChannelPublicId,
      );
      expect(isValid).toBe(false);
    });
  });
}
