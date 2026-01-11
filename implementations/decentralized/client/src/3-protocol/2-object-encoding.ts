import { type GraffitiPostObject } from "@graffiti-garden/api";
import type { ChannelAttestations } from "../2-primitives/2-channel-attestations";
import type { AllowedAttestations } from "../2-primitives/3-allowed-attestations";
import {
  CONTENT_ADDRESS_METHOD_SHA256,
  type ContentAddresses,
} from "../2-primitives/1-content-addresses";
import { randomBytes } from "@noble/hashes/utils.js";
import { encode, decode } from "@ipld/dag-cbor";
import { z } from "zod";
import { CHANNEL_ATTESTATION_METHOD_SHA256_ED25519 } from "../2-primitives/2-channel-attestations";
import { ALLOWED_ATTESTATION_METHOD_HMAC_SHA256 } from "../2-primitives/3-allowed-attestations";
import {
  STRING_ENCODER_METHOD_BASE64URL,
  type StringEncoder,
} from "../2-primitives/0-string-encoding";

// Objects have a max size of 32kb
// If each channel and allowed actor takes 32 bytes
// of space (i.e. they are hashed with 256 bit security)
// then this means that the combined number of channels
// and recipients of object has cannot exceed one thousand.
// This seems like a reasonable limit and on par with
// signal's group chat limit of 1000
const MAX_OBJECT_SIZE_BYTES = 32 * 1024;

export class ObjectEncoding {
  constructor(
    readonly primitives: {
      readonly stringEncoder: StringEncoder;
      readonly channelAttestations: ChannelAttestations;
      readonly allowedAttestations: AllowedAttestations;
      readonly contentAddresses: ContentAddresses;
    },
  ) {}

  async encode(partialObject: GraffitiPostObject<{}>, actor: string) {
    // Create a verifiable attestation that the actor
    // knows the included channels without
    // directly revealing any channel to anyone who doesn't
    // know the channel already
    const channelAttestationAndPublicIds = await Promise.all(
      partialObject.channels.map((channel) =>
        this.primitives.channelAttestations.attest(
          // TODO: get this from the DID document of the actor
          CHANNEL_ATTESTATION_METHOD_SHA256_ED25519,
          actor,
          channel,
        ),
      ),
    );
    const channelAttestations = channelAttestationAndPublicIds.map(
      (c) => c.attestation,
    );
    const channelPublicIds = channelAttestationAndPublicIds.map(
      (c) => c.channelPublicId,
    );

    const objectData: z.infer<typeof ObjectDataSchema> = {
      [VALUE_PROPERTY]: partialObject.value,
      [CHANNEL_ATTESTATIONS_PROPERTY]: channelAttestations,
      [NONCE_PROPERTY]: randomBytes(32),
    };

    let allowedTickets: Uint8Array[] | undefined = undefined;

    // If the object is private...
    if (Array.isArray(partialObject.allowed)) {
      // Create an attestation that the object's allowed list
      // includes the given actors, without revealing the
      // presence of an actor on the list to anyone except
      // that actor themselves. Each actor will receive a
      // "ticket" that they can use to verify their own membership
      // on the allowed list.
      const allowedAttestations = await Promise.all(
        partialObject.allowed.map(async (allowedActor) =>
          this.primitives.allowedAttestations.attest(
            // TODO: get this from the DID document of the actor
            ALLOWED_ATTESTATION_METHOD_HMAC_SHA256,
            allowedActor,
          ),
        ),
      );
      objectData[ALLOWED_ATTESTATIONS_PROPERTY] = allowedAttestations.map(
        (a) => a.attestation,
      );
      allowedTickets = allowedAttestations.map((a) => a.ticket);
    }

    // Encode the mixed JSON/binary data
    // using the CBOR format
    // https://cbor.io/
    const objectBytes = encode(objectData);
    if (objectBytes.byteLength > MAX_OBJECT_SIZE_BYTES) {
      throw new Error("The object is too large");
    }

    // Compute a public identifier (hash) of the object data
    const objectContentAddressBytes =
      await this.primitives.contentAddresses.register(
        // TODO: get this from the DID document of the actor
        CONTENT_ADDRESS_METHOD_SHA256,
        objectBytes,
      );
    const objectContentAddress = await this.primitives.stringEncoder.encode(
      STRING_ENCODER_METHOD_BASE64URL,
      objectContentAddressBytes,
    );
    // Use it to compute the object's URL
    const objectUrl = encodeObjectUrl(actor, objectContentAddress);

    // Return object URL and allowed secrets
    return {
      objectUrl,
      objectBytes,
      channelPublicIds,
      allowedTickets,
    };
  }

  async validate(
    objectValue: {},
    objectUrl: string,
    objectBytes: Uint8Array,
    channelPublicIds: Uint8Array[],
    privateObjectInfo?:
      | {
          recipient: string;
          allowedTicket: Uint8Array;
          allowedIndex: number;
        }
      | {
          recipients: string[];
          allowedTickets: Uint8Array[];
        },
  ): Promise<void> {
    const { actor, contentAddress } = decodeObjectUrl(objectUrl);

    // Make sure the object content address matches the object content
    const contentAddressBytes =
      await this.primitives.stringEncoder.decode(contentAddress);
    const contentAddressMethod =
      await this.primitives.contentAddresses.getMethod(contentAddressBytes);
    const expectedContentAddress =
      await this.primitives.contentAddresses.register(
        contentAddressMethod,
        objectBytes,
      );
    if (
      expectedContentAddress.length !== contentAddressBytes.length ||
      !expectedContentAddress.every((b, i) => b === contentAddressBytes[i])
    ) {
      throw new Error("Content address is invalid");
    }

    // Convert the raw object data from CBOR
    // back to a javascript object
    const objectDataUnknown = decode(objectBytes);
    const objectData = ObjectDataSchema.parse(objectDataUnknown);

    // And extract the values
    const value = objectData[VALUE_PROPERTY];
    const channelAttestations = objectData[CHANNEL_ATTESTATIONS_PROPERTY];
    const allowedAttestations = objectData[ALLOWED_ATTESTATIONS_PROPERTY];

    const valueBytes = encode(value);
    const expectedValueBytes = encode(objectValue);
    if (
      valueBytes.length !== expectedValueBytes.length ||
      !valueBytes.every((b, i) => b === expectedValueBytes[i])
    ) {
      throw new Error("Object value does not match storage value");
    }

    // Validate the object's channels
    if (channelAttestations.length !== channelPublicIds.length) {
      throw new Error("Not as many channel attestations and public ids");
    }
    for (const [index, attestation] of channelAttestations.entries()) {
      const channelPublicId = channelPublicIds[index];
      const isValid = await this.primitives.channelAttestations.validate(
        attestation,
        actor,
        channelPublicId,
      );
      if (!isValid) {
        throw new Error("Invalid channel attestation");
      }
    }

    // Validate the recipient
    if (privateObjectInfo) {
      if (!allowedAttestations) {
        throw new Error("Object is public but thought to be private");
      }

      let recipients: string[];
      let allowedTickets: Uint8Array[];
      let attestations: Uint8Array[];
      if ("recipient" in privateObjectInfo) {
        recipients = [privateObjectInfo.recipient];
        allowedTickets = [privateObjectInfo.allowedTicket];
        attestations = allowedAttestations.filter(
          (_, i) => i === privateObjectInfo.allowedIndex,
        );
      } else {
        recipients = privateObjectInfo.recipients;
        allowedTickets = privateObjectInfo.allowedTickets;
        attestations = allowedAttestations;
      }

      for (const [index, recipient] of recipients.entries()) {
        const allowedTicket = allowedTickets.at(index);
        const allowedAttestation = attestations.at(index);
        if (!allowedTicket) {
          throw new Error("Missing allowed ticket for recipient");
        }
        if (!allowedAttestation) {
          throw new Error("Missing allowed attestation for recipient");
        }
        const isValid = await this.primitives.allowedAttestations.validate(
          allowedAttestation,
          recipient,
          allowedTicket,
        );

        if (!isValid) {
          throw new Error("Invalid allowed attestation for recipient");
        }
      }
    } else if (allowedAttestations) {
      throw new Error("Object is private but no recipient info provided");
    }
  }
}

// A compact data representation of the object data
const VALUE_PROPERTY = "v";
const CHANNEL_ATTESTATIONS_PROPERTY = "c";
const ALLOWED_ATTESTATIONS_PROPERTY = "a";
const NONCE_PROPERTY = "n";

const Uint8ArraySchema = z.custom<Uint8Array>(
  (v): v is Uint8Array => v instanceof Uint8Array,
);

const ObjectDataSchema = z.object({
  [VALUE_PROPERTY]: z.record(z.string(), z.any()),
  [CHANNEL_ATTESTATIONS_PROPERTY]: z.array(Uint8ArraySchema),
  [ALLOWED_ATTESTATIONS_PROPERTY]: z.array(Uint8ArraySchema).optional(),
  [NONCE_PROPERTY]: Uint8ArraySchema,
});

export const GRAFFITI_OBJECT_URL_PREFIX = "graffiti:";

// Methods to encode and decode object URLs
export function encodeObjectUrlComponent(value: string) {
  const replaced = value.replace(/:/g, "!").replace(/\//g, "~");
  return encodeURIComponent(replaced);
}
export function decodeObjectUrlComponent(value: string) {
  const decoded = decodeURIComponent(value);
  return decoded.replace(/!/g, ":").replace(/~/g, "/");
}
export function encodeObjectUrl(actor: string, contentAddress: string) {
  return `${GRAFFITI_OBJECT_URL_PREFIX}${encodeObjectUrlComponent(actor)}:${encodeObjectUrlComponent(contentAddress)}`;
}
export function decodeObjectUrl(objectUrl: string) {
  if (!objectUrl.startsWith(GRAFFITI_OBJECT_URL_PREFIX)) {
    throw new Error("Invalid object URL");
  }

  const rest = objectUrl.slice(GRAFFITI_OBJECT_URL_PREFIX.length);
  const parts = rest.split(":");

  if (parts.length !== 2) {
    throw new Error("Invalid object URL format");
  }

  const [actor, contentAddress] = parts;

  return {
    actor: decodeObjectUrlComponent(actor),
    contentAddress: decodeObjectUrlComponent(contentAddress),
  };
}
