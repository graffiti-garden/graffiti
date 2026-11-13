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
const VALIDATION_CACHE_LIMIT = 1024;
const MAX_CACHED_ACTOR_LENGTH = 2048;

export class ChannelAttestations {
  private readonly validations = new Map<string, Promise<boolean>>();

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

    // Cache only signature verification; object and permission checks still run.
    // Keep malformed/oversized inputs on the normal verifier path without
    // allocating cache keys for them.
    const cacheable =
      attestation.byteLength === 64 &&
      channelPublicId.byteLength === 33 &&
      actor.length <= MAX_CACHED_ACTOR_LENGTH;
    if (!cacheable) {
      return await verifyAsync(
        attestation,
        new TextEncoder().encode(actor),
        channelPublicId.slice(1),
      );
    }

    // Snapshot before verification: callers can mutate their typed arrays while
    // the verifier awaits hashing. Uint8Array also copies Node Buffer views.
    const signature = new Uint8Array(attestation);
    const publicId = new Uint8Array(channelPublicId);
    const key = JSON.stringify([
      actor,
      Array.from(signature),
      Array.from(publicId),
    ]);
    const cached = this.validations.get(key);
    if (cached) {
      this.validations.delete(key);
      this.validations.set(key, cached);
      return await cached;
    }

    const promise = verifyAsync(
      signature,
      new TextEncoder().encode(actor),
      publicId.subarray(1),
    );
    this.validations.set(key, promise);
    while (this.validations.size > VALIDATION_CACHE_LIMIT) {
      this.validations.delete(this.validations.keys().next().value!);
    }
    // Both true and false are stable results. Retry only verification errors.
    void promise.catch(() => {
      if (this.validations.get(key) === promise) this.validations.delete(key);
    });
    return await promise;
  }
}
