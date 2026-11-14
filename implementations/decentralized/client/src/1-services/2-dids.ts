import { GraffitiErrorNotFound } from "@graffiti-garden/api";
import { Resolver, type DIDDocument, type ResolverRegistry } from "did-resolver";
import { getResolver as plcResolver } from "plc-did-resolver";
import { getResolver as webResolver } from "web-did-resolver";

// Endpoint rotations keep the old endpoint alive for a day. A normal TTL lets
// clients learn the replacement without bypassing the cache on storage errors.
const DID_CACHE_TTL_MS = 60 * 60 * 1000;

export class DecentralizedIdentifiers {
  protected readonly methods: Record<string, unknown> = {
    ...plcResolver(),
    ...webResolver(),
  };

  protected readonly resolver = new Resolver(
    this.methods as unknown as ResolverRegistry,
    { cache: false },
  );

  protected readonly documents = new Map<string, { document: DIDDocument; expiresAt: number }>();
  protected readonly inFlight = new Map<string, Promise<DIDDocument>>();

  async resolve(did: string): Promise<DIDDocument> {
    if (
      !Object.keys(this.methods).some((method) =>
        did.startsWith(`did:${method}:`),
      )
    ) {
      throw new Error(`Unrecognized DID method: ${did}`);
    }

    const cached = this.documents.get(did);
    if (cached && cached.expiresAt > Date.now()) return cached.document;
    this.documents.delete(did);

    const inFlight = this.inFlight.get(did);
    if (inFlight) return inFlight;

    const resolution = this.resolver.resolve(did).then(({ didDocument }) => {
      if (!didDocument) {
        throw new GraffitiErrorNotFound(`DID not found: ${did}`);
      }
      // Failed resolutions are never cached, and simultaneous misses still
      // share the single in-flight request below.
      this.documents.set(did, {
        document: didDocument,
        expiresAt: Date.now() + DID_CACHE_TTL_MS,
      });
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
