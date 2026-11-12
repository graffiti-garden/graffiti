import { verifyAsync } from "@noble/ed25519";
import { ChannelAttestations } from "../../client/src/2-primitives/3-channel-attestations";
import { StringEncoder } from "../../client/src/2-primitives/1-string-encoding";
import { ContentAddresses } from "../../client/src/2-primitives/2-content-addresses";
import { AllowedAttestations } from "../../client/src/2-primitives/4-allowed-attestations";
import { ObjectEncoding } from "../../client/src/3-protocol/3-object-encoding";

// Exact validation body at e2b7451e2; encoding methods are unchanged by this PR.
class BaselineAttestations extends ChannelAttestations {
  override async validate(
    attestation: Uint8Array,
    actor: string,
    channelPublicId: Uint8Array,
  ) {
    const prefix = channelPublicId[0];
    if (prefix !== 0)
      throw new Error(
        `Unrecognized channel attestation method prefix: ${prefix}`,
      );
    return await verifyAsync(
      attestation,
      new TextEncoder().encode(actor),
      channelPublicId.slice(1),
    );
  }
}
function encoding(attestations: ChannelAttestations) {
  return new ObjectEncoding({
    channelAttestations: attestations,
    stringEncoder: new StringEncoder(),
    contentAddresses: new ContentAddresses(),
    allowedAttestations: new AllowedAttestations(),
  });
}
export const scenarios = [
  { name: "481 objects /18 actors", objects: 481, actors: 18 },
  { name: "64 objects /64 actors", objects: 64, actors: 64 },
  { name: "4 objects /4 actors", objects: 4, actors: 4 },
];
const fixtures = new Map<
  string,
  Awaited<ReturnType<ObjectEncoding["encode"]>>[]
>();
export async function prepare() {
  const coder = encoding(new BaselineAttestations());
  for (const scenario of scenarios) {
    const cases = [];
    for (let i = 0; i < scenario.objects; i++)
      cases.push(
        await coder.encode(
          {
            value: {
              type: "Update",
              object: {
                type: "PixelCell",
                x: i % 50,
                y: Math.floor(i / 50) % 50,
              },
              result: { type: "PixelState", on: true, color: "#3661e2" },
              published: "2026-01-01T00:00:00.000Z",
            },
            channels: ["synthetic-pixel-canvas"],
          },
          `did:example:synthetic-actor-${i % scenario.actors}`,
        ),
      );
    fixtures.set(scenario.name, cases);
  }
}
export async function run(scenarioName: string, mode: "baseline" | "memo") {
  const cases = fixtures.get(scenarioName)!;
  const attestations =
    mode === "baseline"
      ? new BaselineAttestations()
      : new ChannelAttestations();
  const coder = encoding(attestations);
  (globalThis as any).__verificationCalls = 0;
  const start = performance.now();
  for (let i = 0; i < cases.length; i += 128)
    await Promise.all(
      cases
        .slice(i, i + 128)
        .map((x) => coder.validate(x.object, x.tags, x.objectBytes)),
    );
  const ms = performance.now() - start;
  const verificationCalls = (globalThis as any).__verificationCalls;
  // Cached attestations must never turn into a cached object-validity decision.
  const changed = new Uint8Array(cases[0].objectBytes);
  changed[changed.length - 1] ^= 1;
  let alteredBytesRejected = false;
  try {
    await coder.validate(cases[0].object, cases[0].tags, changed);
  } catch {
    alteredBytesRejected = true;
  }
  return {
    scenario: scenarioName,
    mode,
    ms,
    objects: cases.length,
    verificationCalls,
    cacheSize: (attestations as any).validations.size,
    alteredBytesRejected,
  };
}
