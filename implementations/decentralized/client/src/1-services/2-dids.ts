import { GraffitiErrorNotFound } from "@graffiti-garden/api";
import { Resolver, type DIDDocument, type ResolverRegistry } from "did-resolver";
import { getResolver as plcResolver } from "plc-did-resolver";
import { getResolver as webResolver } from "web-did-resolver";

export class DecentralizedIdentifiers {
  protected readonly methods: Record<string, unknown> = {
    ...plcResolver(),
    ...webResolver(),
  };

  protected readonly resolver = new Resolver(
    this.methods as unknown as ResolverRegistry,
    { cache: true },
  );

  protected readonly inFlight = new Map<string, Promise<DIDDocument>>();

  async resolve(did: string): Promise<DIDDocument> {
    if (
      !Object.keys(this.methods).some((method) =>
        did.startsWith(`did:${method}:`),
      )
    ) {
      throw new Error(`Unrecognized DID method: ${did}`);
    }

    const inFlight = this.inFlight.get(did);
    if (inFlight) return inFlight;

    const resolution = this.resolver.resolve(did).then(({ didDocument }) => {
      if (!didDocument) {
        throw new GraffitiErrorNotFound(`DID not found: ${did}`);
      }
      return didDocument;
    });
    this.inFlight.set(did, resolution);

    try {
      return await resolution;
    } finally {
      this.inFlight.delete(did);
    }
  }
}
