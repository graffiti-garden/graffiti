import {
    OptionalAlsoKnownAsSchema,
    OptionalServicesSchema,
    type OptionalAlsoKnownAs,
    type OptionalServices,
} from "../../../shared/did-schemas";
import type { Actor } from "./types";

export async function fetchActorDidData(
    actor: Pick<Actor, "did" | "rotationKey">,
): Promise<{ alsoKnownAs: OptionalAlsoKnownAs; services: OptionalServices }> {
    const response = await fetch(`https://plc.directory/${actor.did}/data`);
    if (!response.ok) {
        throw new Error(`Failed to fetch actor DID document for ${actor.did}`);
    }

    const json = await response.json();
    if (json.did !== actor.did) {
        throw new Error(`DID mismatch: ${json.did} !== ${actor.did}`);
    }
    if (!json.rotationKeys.includes(actor.rotationKey)) {
        throw new Error(`Rotation key mismatch for ${actor.did}`);
    }

    return {
        alsoKnownAs: OptionalAlsoKnownAsSchema.parse(json.alsoKnownAs),
        services: OptionalServicesSchema.parse(json.services),
    };
}
