import { Resolver, type DIDDocument } from "did-resolver";
import { getResolver as plcResolver } from "plc-did-resolver";
import { getResolver as webResolver } from "web-did-resolver";

export class DecentralizedIdentifiers {
  protected readonly methods = {
    ...plcResolver(),
    ...webResolver(),
  };

  protected readonly resolver = new Resolver(this.methods, { cache: true });

  async resolve(did: string): Promise<DIDDocument | null> {
    if (
      !Object.keys(this.methods).some((method) =>
        did.startsWith(`did:${method}:`),
      )
    ) {
      throw new Error(`Unrecognized DID method: ${did}`);
    }

    const { didDocument } = await this.resolver.resolve(did);
    return didDocument;
  }
}

async function test() {
  const didInstance = new DecentralizedIdentifiers();
  console.log(await didInstance.resolve("did:plc:wpruhkft6tujbxnhnm6g6pbn"));
}
test();
