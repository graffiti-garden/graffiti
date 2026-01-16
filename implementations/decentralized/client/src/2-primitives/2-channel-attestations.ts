import {
  getPublicKeyAsync,
  signAsync,
  verifyAsync,
  hashes,
} from "@noble/ed25519";
import { sha256, sha512 } from "@noble/hashes/webcrypto.js";
hashes.sha512Async = sha512;

export const CHANNEL_ATTESTATION_METHOD_SHA256_ED25519 = "pk:sha2-256+ed25519";
const CHANNEL_ATTESTATION_METHOD_PREFIX_SHA256_ED25519 = 0;

export class ChannelAttestations {
  async register(
    channelAttestationMethod: string,
    channel: string,
  ): Promise<Uint8Array> {
    if (
      channelAttestationMethod !== CHANNEL_ATTESTATION_METHOD_SHA256_ED25519
    ) {
      throw new Error(
        `Unsupported channel attestation method: ${channelAttestationMethod}`,
      );
    }
    const privateKey = await this.channelToPrivateKey(channel);
    return await this.channelPublicIdFromPrivateKey(privateKey);
  }

  async getMethod(channelPublicId: Uint8Array): Promise<string> {
    if (
      channelPublicId[0] === CHANNEL_ATTESTATION_METHOD_PREFIX_SHA256_ED25519
    ) {
      return CHANNEL_ATTESTATION_METHOD_SHA256_ED25519;
    } else {
      throw new Error(`Unrecognized channel attestation method.`);
    }
  }

  protected async channelToPrivateKey(channel: string): Promise<Uint8Array> {
    const channelBytes = new TextEncoder().encode(channel);
    return await sha256(channelBytes);
  }
  protected async channelPublicIdFromPrivateKey(
    privateKey: Uint8Array,
  ): Promise<Uint8Array> {
    const channelPublicIdRaw = await getPublicKeyAsync(privateKey);
    const channelPublicId = new Uint8Array(channelPublicIdRaw.length + 1);
    channelPublicId[0] = CHANNEL_ATTESTATION_METHOD_PREFIX_SHA256_ED25519;
    channelPublicId.set(channelPublicIdRaw, 1);
    return channelPublicId;
  }

  async attest(
    channelAttestationMethod: string,
    actor: string,
    channel: string,
  ): Promise<{
    attestation: Uint8Array;
    channelPublicId: Uint8Array;
  }> {
    if (
      channelAttestationMethod !== CHANNEL_ATTESTATION_METHOD_SHA256_ED25519
    ) {
      throw new Error(
        `Unsupported channel attestation method: ${channelAttestationMethod}`,
      );
    }
    const privateKey = await this.channelToPrivateKey(channel);
    const channelPublicId =
      await this.channelPublicIdFromPrivateKey(privateKey);

    const actorBytes = new TextEncoder().encode(actor);
    const attestation = await signAsync(actorBytes, privateKey);
    return { attestation, channelPublicId };
  }

  async validate(
    attestation: Uint8Array,
    actor: string,
    channelPublicId: Uint8Array,
  ): Promise<boolean> {
    const prefix = channelPublicId[0];
    if (prefix !== CHANNEL_ATTESTATION_METHOD_PREFIX_SHA256_ED25519) {
      throw new Error(
        `Unrecognized channel attestation method prefix: ${prefix}`,
      );
    }

    return await verifyAsync(
      attestation,
      new TextEncoder().encode(actor),
      channelPublicId.slice(1),
    );
  }
}
