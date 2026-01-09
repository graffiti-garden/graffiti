import type { Graffiti } from "@graffiti-garden/api";
import { GraffitiErrorNotFound } from "@graffiti-garden/api";
import { DecentralizedIdentifiers } from "../1-services/1-dids";

// Handles used a fixed method
const HANDLE_DID_PREFIX = "did:web:";

export class Handles {
  constructor(readonly services: { dids: DecentralizedIdentifiers }) {}

  actorToHandle: Graffiti["actorToHandle"] = async (actor) => {
    const actorDocument = await this.services.dids.resolve(actor);
    if (!actorDocument) {
      throw new GraffitiErrorNotFound(`Actor DID ${actor} not found`);
    }

    const handleDid = actorDocument.alsoKnownAs?.at(0);
    if (!handleDid) {
      throw new GraffitiErrorNotFound(
        `Handle for actor DID ${actor} not found`,
      );
    }
    if (!handleDid.startsWith(HANDLE_DID_PREFIX)) {
      throw new Error(`Handle DID ${handleDid} is not a valid handle`);
    }

    const handle = handleDid.slice(HANDLE_DID_PREFIX.length);

    const handleDocument = await this.services.dids.resolve(handleDid);
    if (!handleDocument) {
      throw new GraffitiErrorNotFound(`Handle DID ${handleDid} not found`);
    }
    if (
      !handleDocument.alsoKnownAs ||
      !handleDocument.alsoKnownAs.includes(actor)
    ) {
      throw new Error(`Handle ${handle} does not match actor ${actor}`);
    }

    return handle;
  };

  handleToActor: Graffiti["handleToActor"] = async (handle) => {
    const handleDid = `${HANDLE_DID_PREFIX}${handle}`;
    const handleDocument = await this.services.dids.resolve(handleDid);
    if (!handleDocument) {
      throw new GraffitiErrorNotFound(`Handle DID ${handleDid} not found`);
    }

    const actor = handleDocument.alsoKnownAs?.at(0);
    if (!actor) {
      throw new GraffitiErrorNotFound(
        `Actor for handle DID ${handleDid} not found`,
      );
    }

    const actorDocument = await this.services.dids.resolve(actor);
    if (!actorDocument) {
      throw new GraffitiErrorNotFound(`Actor DID ${actor} not found`);
    }
    if (
      !actorDocument.alsoKnownAs ||
      !actorDocument.alsoKnownAs.includes(handleDid)
    ) {
      throw new Error(`Actor ${actor} does not match handle ${handle}`);
    }

    return actor;
  };
}

async function test() {
  const handles = new Handles({
    dids: new DecentralizedIdentifiers(),
  });
  const handle = "theia.graffiti.actor";
  console.log(`Handle: ${handle}`);
  const actor = await handles.handleToActor(handle);
  console.log(`Actor: ${actor}`);
  const resolvedHandle = await handles.actorToHandle(actor);
  console.log(`Resolved Handle: ${resolvedHandle}`);
}
// test();
