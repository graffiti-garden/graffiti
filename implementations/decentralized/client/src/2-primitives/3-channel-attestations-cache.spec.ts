import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { verifyAsync } from "@noble/ed25519";
import {
  ChannelAttestations,
  CHANNEL_ATTESTATION_METHOD_SHA256_ED25519 as method,
} from "./3-channel-attestations";
import { ObjectEncoding } from "../3-protocol/3-object-encoding";
import { StringEncoder } from "./1-string-encoding";
import { ContentAddresses } from "./2-content-addresses";
import { AllowedAttestations } from "./4-allowed-attestations";

vi.mock("@noble/ed25519", async (original) => {
  const actual = await original<typeof import("@noble/ed25519")>();
  return { ...actual, verifyAsync: vi.fn(actual.verifyAsync) };
});
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());
const actor = "did:example:synthetic-fixture";
const size = (attestations: ChannelAttestations) =>
  (attestations as any).validations.size;

describe("exact channel attestation memo", () => {
  it("shares concurrent exact clones but rechecks actor, signature and channel changes", async () => {
    const attestations = new ChannelAttestations();
    const { attestation: sig, channelPublicId: key } =
      await attestations.attest(method, actor, "fixture-channel");
    expect(
      await Promise.all(
        Array.from({ length: 30 }, () =>
          attestations.validate(sig.slice(), actor, key.slice()),
        ),
      ),
    ).toEqual(Array(30).fill(true));
    expect(verifyAsync).toHaveBeenCalledTimes(1);
    for (const [s, a, k] of [
      [sig, actor + "-other", key],
      [Uint8Array.from(sig, (b, i) => (i ? b : b ^ 1)), actor, key],
      [sig, actor, await attestations.register(method, "different-channel")],
    ] as const) {
      expect(await attestations.validate(s, a, k)).toBe(false);
      expect(await attestations.validate(s, a, k)).toBe(false);
    }
    expect(verifyAsync).toHaveBeenCalledTimes(7);
    const bad = key.slice();
    bad[0] = 255;
    await expect(attestations.validate(sig, actor, bad)).rejects.toThrow();
    await expect(attestations.validate(sig, actor, bad)).rejects.toThrow();
    expect(size(attestations)).toBe(1);
  });

  it("snapshots typed array and Buffer input before asynchronous verification", async () => {
    const attestations = new ChannelAttestations();
    const x = await attestations.attest(method, actor, "fixture");
    const sig = Buffer.from(x.attestation),
      key = Buffer.from(x.channelPublicId);
    const pending = attestations.validate(sig, actor, key);
    sig.fill(0);
    key.fill(0);
    expect(await pending).toBe(true);
    expect(
      await attestations.validate(x.attestation, actor, x.channelPublicId),
    ).toBe(true);
    expect(verifyAsync).toHaveBeenCalledTimes(1);
  });

  it("does not cache malformed or oversized tuples", async () => {
    const attestations = new ChannelAttestations();
    const x = await attestations.attest(method, actor, "fixture");
    expect(
      await attestations.validate(x.attestation, actor, x.channelPublicId),
    ).toBe(true);
    expect(verifyAsync).toHaveBeenCalledTimes(1);
    const longActor = "did:example:" + "x".repeat(2048);
    const long = await attestations.attest(method, longActor, "fixture");
    for (let i = 0; i < 2; i++)
      expect(
        await attestations.validate(
          long.attestation,
          longActor,
          long.channelPublicId,
        ),
      ).toBe(true);
    for (let i = 0; i < 2; i++)
      await expect(
        attestations.validate(x.attestation.slice(1), actor, x.channelPublicId),
      ).rejects.toThrow();
    expect(size(attestations)).toBe(1);
    expect(verifyAsync).toHaveBeenCalledTimes(5);
  });

  it("bounds retained entries with LRU eviction", async () => {
    const attestations = new ChannelAttestations();
    // This test isolates retention policy; other tests exercise real signatures.
    const signature = new Uint8Array(64),
      key = new Uint8Array(33);
    for (let i = 0; i < 1024; i++) {
      vi.mocked(verifyAsync).mockResolvedValueOnce(true);
      expect(await attestations.validate(signature, `actor-${i}`, key)).toBe(
        true,
      );
    }
    expect(size(attestations)).toBe(1024);
    expect(await attestations.validate(signature, "actor-0", key)).toBe(true);
    vi.mocked(verifyAsync).mockResolvedValueOnce(true);
    expect(await attestations.validate(signature, "actor-1024", key)).toBe(
      true,
    );
    expect(size(attestations)).toBe(1024);
    expect(await attestations.validate(signature, "actor-0", key)).toBe(true);
    vi.mocked(verifyAsync).mockResolvedValueOnce(true);
    expect(await attestations.validate(signature, "actor-1", key)).toBe(true);
    expect(verifyAsync).toHaveBeenCalledTimes(1026);
  });

  it("removes rejected verifications instead of retaining a poisoned promise", async () => {
    const attestations = new ChannelAttestations();
    const x = await attestations.attest(method, actor, "fixture");
    vi.mocked(verifyAsync).mockRejectedValueOnce(
      new Error("Synthetic hashing failure"),
    );
    await expect(
      attestations.validate(x.attestation, actor, x.channelPublicId),
    ).rejects.toThrow("Synthetic hashing failure");
    expect(size(attestations)).toBe(0);
    expect(
      await attestations.validate(x.attestation, actor, x.channelPublicId),
    ).toBe(true);
    expect(verifyAsync).toHaveBeenCalledTimes(2);
  });

  it("does not let an old rejection remove a replacement after LRU eviction", async () => {
    const attestations = new ChannelAttestations();
    const x = await attestations.attest(method, actor, "fixture");
    let reject!: (error: Error) => void;
    vi.mocked(verifyAsync).mockImplementationOnce(
      () =>
        new Promise<boolean>((_, rejectPromise) => {
          reject = rejectPromise;
        }),
    );
    const first = attestations.validate(
      x.attestation,
      actor,
      x.channelPublicId,
    );
    const rejected = expect(first).rejects.toThrow("Old verification failed");
    // Pending work can be evicted too. Its eventual rejection must not remove
    // a new successful verification of the same tuple.
    for (let i = 0; i < 1024; i++) {
      vi.mocked(verifyAsync).mockResolvedValueOnce(true);
      await attestations.validate(
        x.attestation,
        `did:example:other-${i}`,
        x.channelPublicId,
      );
    }
    expect(
      await attestations.validate(x.attestation, actor, x.channelPublicId),
    ).toBe(true);
    reject(new Error("Old verification failed"));
    await rejected;
    expect(size(attestations)).toBe(1024);
    expect(
      await attestations.validate(x.attestation, actor, x.channelPublicId),
    ).toBe(true);
    expect(verifyAsync).toHaveBeenCalledTimes(1026);
  });

  it("still validates current object bytes, value, channels and private recipients", async () => {
    const attestations = new ChannelAttestations();
    const encoding = new ObjectEncoding({
      channelAttestations: attestations,
      stringEncoder: new StringEncoder(),
      contentAddresses: new ContentAddresses(),
      allowedAttestations: new AllowedAttestations(),
    });
    const result = await encoding.encode(
      {
        value: { text: "fixture" },
        channels: ["fixture"],
        allowed: ["did:example:recipient"],
      },
      actor,
    );
    const privateInfo = {
      recipient: "did:example:recipient",
      allowedTicket: result.allowedTickets![0],
      allowedIndex: 0,
    };
    const validate = (
      object = result.object,
      bytes = result.objectBytes,
      info = privateInfo,
    ) => encoding.validate(object, result.tags, bytes, info);
    await validate();
    await validate();
    expect(verifyAsync).toHaveBeenCalledTimes(1);
    await expect(
      validate({ ...result.object, value: { text: "changed" } }),
    ).rejects.toThrow("Object value does not match storage value");
    const altered = new Uint8Array(result.objectBytes);
    altered[altered.length - 1] ^= 1;
    await expect(validate(result.object, altered)).rejects.toThrow(
      "Content address is invalid",
    );
    await expect(
      validate({ ...result.object, channels: ["stale-or-renamed-channel"] }),
    ).rejects.toThrow("Channel public id does not match expected");
    await expect(
      validate(result.object, result.objectBytes, {
        ...privateInfo,
        recipient: "did:example:other",
      }),
    ).rejects.toThrow();
    const badTicket = new Uint8Array(privateInfo.allowedTicket);
    badTicket[0] ^= 1;
    await expect(
      validate(result.object, result.objectBytes, {
        ...privateInfo,
        allowedTicket: badTicket,
      }),
    ).rejects.toThrow();
    const next = await encoding.encode(
      { value: { text: "new current value" }, channels: ["fixture"] },
      actor,
    );
    await encoding.validate(next.object, next.tags, next.objectBytes);
    expect(verifyAsync).toHaveBeenCalledTimes(1);
  });
});
