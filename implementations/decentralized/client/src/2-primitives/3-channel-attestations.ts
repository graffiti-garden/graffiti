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
const VALIDATION_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHED_ACTOR_LENGTH = 2048;

export class ChannelAttestations {
  private readonly validations = new Map<
    string,
    {
      until: number;
      promise: Promise<boolean>;
    }
  >();

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

    // These immutable bytes identify a mathematical verification result, not
    // an object's current storage state, channel membership or permission.
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
    const now = performance.now();
    const cached = this.validations.get(key);
    if (cached && cached.until > now) {
      this.validations.delete(key);
      this.validations.set(key, cached);
      return await cached.promise;
    }
    if (cached) this.validations.delete(key);

    const promise = verifyAsync(
      signature,
      new TextEncoder().encode(actor),
      publicId.subarray(1),
    );
    const entry = { until: now + VALIDATION_CACHE_TTL_MS, promise };
    this.validations.set(key, entry);
    while (this.validations.size > VALIDATION_CACHE_LIMIT) {
      this.validations.delete(this.validations.keys().next().value!);
    }
    const remove = () => {
      if (this.validations.get(key) === entry) this.validations.delete(key);
    };
    // Singleflight pending calls, but do not retain failed verification results.
    void promise.then((valid) => {
      if (!valid) remove();
    }, remove);
    return await promise;
  }
}
