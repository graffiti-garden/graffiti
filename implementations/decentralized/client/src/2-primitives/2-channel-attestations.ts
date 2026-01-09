import { getPublicKey, sign, verify } from "@noble/ed25519";
import { sha256 } from "@noble/hashes/webcrypto.js";

const CHANNEL_ATTESTATION_METHOD_SHA256_ED25519 = "pk:sha2-256+ed25519";
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
    const publicKey = getPublicKey(privateKey);

    const prefixedPublicKey = new Uint8Array(publicKey.length + 1);
    prefixedPublicKey[0] = CHANNEL_ATTESTATION_METHOD_PREFIX_SHA256_ED25519;
    prefixedPublicKey.set(publicKey, 1);
    return prefixedPublicKey;
  }

  async getMethod(channelPublicId: Uint8Array): Promise<string> {
    const prefix = channelPublicId[0];
    if (prefix === CHANNEL_ATTESTATION_METHOD_PREFIX_SHA256_ED25519) {
      return CHANNEL_ATTESTATION_METHOD_SHA256_ED25519;
    } else {
      throw new Error(
        `Unrecognized channel attestation method prefix: ${prefix}`,
      );
    }
  }

  async attest(
    channelAttestationMethod: string,
    actor: string,
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
    const actorBytes = new TextEncoder().encode(actor);
    const signature = sign(actorBytes, privateKey);
    return signature;
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

    return verify(
      attestation,
      new TextEncoder().encode(actor),
      channelPublicId.slice(1),
    );
  }

  protected async channelToPrivateKey(channel: string): Promise<Uint8Array> {
    const channelBytes = new TextEncoder().encode(channel);
    return await sha256(channelBytes);
  }
}
