import { describe, expect, test } from "vitest";
import {
  CHANNEL_ATTESTATION_METHOD_SHA256_ED25519,
  ChannelAttestations,
} from "./3-channel-attestations";
import { randomBytes } from "@noble/hashes/utils.js";
import {
  StringEncoder,
  STRING_ENCODER_METHOD_BASE64URL,
} from "./1-string-encoding";

export function channelAttestationTests() {
  describe("Channel Attestation Tests", () => {
    const allowedAttestationMethods = [
      CHANNEL_ATTESTATION_METHOD_SHA256_ED25519,
    ];
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
        test("get method", async () => {
          const channel = await randomChannel();
          const publicId = await channelAttestations.register(method, channel);
          const methodReturned = await channelAttestations.getMethod(publicId);
          expect(methodReturned).toEqual(method);
        });

        test("Idempotent public Ids", async () => {
          const channel = await randomChannel();
          const publicId1 = await channelAttestations.register(method, channel);
          const publicId2 = await channelAttestations.register(method, channel);
          expect(publicId1).toEqual(publicId2);
        });

        test("Unique public ids", async () => {
          const channel1 = await randomChannel();
          const channel2 = await randomChannel();
          const publicId1 = await channelAttestations.register(
            method,
            channel1,
          );
          const publicId2 = await channelAttestations.register(
            method,
            channel2,
          );
          expect(publicId1).not.toEqual(publicId2);
        });

        test("Valid attestation", async () => {
          const actor = await randomActor();
          const channel = await randomChannel();
          const { attestation, channelPublicId } =
            await channelAttestations.attest(method, actor, channel);
          const isValid = await channelAttestations.validate(
            attestation,
            actor,
            channelPublicId,
          );
          expect(isValid).toBe(true);

          const channelPublicIdSeperate = await channelAttestations.register(
            method,
            channel,
          );
          expect(channelPublicId).toEqual(channelPublicIdSeperate);
        });

        test("reuses actor/channel attestations without sharing mutable output", async () => {
          class CountingAttestations extends ChannelAttestations {
            derivations = 0;
            protected async channelToPrivateKey(channel: string) {
              this.derivations++;
              return super.channelToPrivateKey(channel);
            }
          }
          const attestations = new CountingAttestations();
          const actor = await randomActor();
          const channel = await randomChannel();
          const [first, second] = await Promise.all([
            attestations.attest(method, actor, channel),
            attestations.attest(method, actor, channel),
          ]);
          expect(first).toEqual(second);
          expect(attestations.derivations).toBe(1);
          first.attestation.fill(0);
          first.channelPublicId.fill(0);
          expect(await attestations.attest(method, actor, channel)).toEqual(second);
          const otherActor = await attestations.attest(method, await randomActor(), channel);
          const otherChannel = await attestations.attest(method, actor, await randomChannel());
          expect(otherActor.attestation).not.toEqual(second.attestation);
          expect(otherChannel.channelPublicId).not.toEqual(second.channelPublicId);
          expect(attestations.derivations).toBe(3);
        });

        test("an attestation failure can be retried", async () => {
          class InterruptedAttestations extends ChannelAttestations {
            interrupted = true;
            protected async channelToPrivateKey(channel: string) {
              if (this.interrupted) { this.interrupted = false; throw new Error("interrupted"); }
              return super.channelToPrivateKey(channel);
            }
          }
          const attestations = new InterruptedAttestations();
          const actor = await randomActor();
          const channel = await randomChannel();
          await expect(attestations.attest(method, actor, channel)).rejects.toThrow("interrupted");
          const { attestation, channelPublicId } = await attestations.attest(method, actor, channel);
          expect(await attestations.validate(attestation, actor, channelPublicId)).toBe(true);
        });

        test("Invalid attestation with wrong actor", async () => {
          const actor = await randomActor();
          const wrongActor = await randomActor();
          const channel = await randomChannel();
          const { attestation, channelPublicId } =
            await channelAttestations.attest(method, actor, channel);
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
          const { attestation, channelPublicId } =
            await channelAttestations.attest(method, actor, channel);
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
  });
}
