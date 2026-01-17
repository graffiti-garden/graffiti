import { GraffitiErrorNotFound } from "@graffiti-garden/api";
import { Resolver, type DIDDocument } from "did-resolver";
import { getResolver as plcResolver } from "plc-did-resolver";
import { getResolver as webResolver } from "web-did-resolver";

export class DecentralizedIdentifiers {
  protected readonly methods = {
    ...plcResolver(),
    ...webResolver(),
  };

  protected readonly resolver = new Resolver(this.methods, { cache: true });

  async resolve(did: string): Promise<DIDDocument> {
    if (
      !Object.keys(this.methods).some((method) =>
        did.startsWith(`did:${method}:`),
      )
    ) {
      throw new Error(`Unrecognized DID method: ${did}`);
    }

    const { didDocument } = await this.resolver.resolve(did);
    if (!didDocument) {
      throw new GraffitiErrorNotFound(`DID not found: ${did}`);
    }

    return didDocument;
  }
}
