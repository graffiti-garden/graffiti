import type { JSONSchema } from "json-schema-to-ts";
import {
  GraffitiErrorNotFound,
  maskGraffitiObject,
  type Graffiti,
  type GraffitiLoginEvent,
  type GraffitiObjectBase,
  type GraffitiPostObject,
  type GraffitiSession,
  type GraffitiObject,
  unpackObjectUrl,
  type GraffitiObjectUrl,
  compileGraffitiObjectSchema,
  GraffitiErrorSchemaMismatch,
  GraffitiErrorForbidden,
} from "@graffiti-garden/api";
import { randomBytes } from "@noble/hashes/utils.js";
import {
  encode as dagCborEncode,
  decode as dagCborDecode,
} from "@ipld/dag-cbor";

import { DecentralizedIdentifiers } from "../1-services/2-dids";
import { Authorization } from "../1-services/1-authorization";
import { StorageBuckets } from "../1-services/3-storage-buckets";
import {
  Inboxes,
  MESSAGE_METADATA_KEY,
  MESSAGE_OBJECT_KEY,
  MESSAGE_TAGS_KEY,
  type MessageStream,
} from "../1-services/4-inboxes";

import {
  StringEncoder,
  STRING_ENCODER_METHOD_BASE64URL,
} from "../2-primitives/1-string-encoding";
import { ContentAddresses } from "../2-primitives/2-content-addresses";
import { ChannelAttestations } from "../2-primitives/3-channel-attestations";
import { AllowedAttestations } from "../2-primitives/4-allowed-attestations";

import { Handles } from "./2-handles";
import {
  Sessions,
  DID_SERVICE_ID_GRAFFITI_PERSONAL_INBOX,
  DID_SERVICE_TYPE_GRAFFITI_INBOX,
  DID_SERVICE_ID_GRAFFITI_STORAGE_BUCKET,
  DID_SERVICE_TYPE_GRAFFITI_STORAGE_BUCKET,
} from "./1-sessions";
import {
  decodeObjectUrl,
  MAX_OBJECT_SIZE_BYTES,
  ObjectEncoding,
} from "./3-object-encoding";
import {
  type infer as infer_,
  custom,
  string,
  boolean,
  strictObject,
  array,
  int,
  nonnegative,
  optional,
  extend,
  union,
} from "zod/mini";

const Uint8ArraySchema = custom<Uint8Array>(
  (v): v is Uint8Array => v instanceof Uint8Array,
);
const MESSAGE_DATA_STORAGE_BUCKET_KEY = "k";
const MESSAGE_DATA_TOMBSTONE_KEY = "t";
const MESSAGE_DATA_ALLOWED_TICKET_KEY = "a";
const MESSAGE_DATA_ALLOWED_TICKET_INDEX_KEY = "i";
const MESSAGE_DATA_ALLOWED_TICKETS_KEY = "s";
const MessageMetadataBaseSchema = strictObject({
  [MESSAGE_DATA_STORAGE_BUCKET_KEY]: string(),
  [MESSAGE_DATA_TOMBSTONE_KEY]: optional(boolean()),
});
const MessageMetaDataSelfSchema = extend(MessageMetadataBaseSchema, {
  [MESSAGE_DATA_ALLOWED_TICKETS_KEY]: optional(array(Uint8ArraySchema)),
});
const MessageMetadataPrivateSchema = extend(MessageMetadataBaseSchema, {
  [MESSAGE_DATA_ALLOWED_TICKET_KEY]: Uint8ArraySchema,
  [MESSAGE_DATA_ALLOWED_TICKET_INDEX_KEY]: int().check(nonnegative()),
});
const MessageMetadataSchema = union([
  MessageMetaDataSelfSchema,
  MessageMetadataPrivateSchema,
]);
type MessageMetadataBase = infer_<typeof MessageMetadataBaseSchema>;
type MessageMetadata = infer_<typeof MessageMetadataSchema>;

const MESSAGE_LABEL_UNLABELED = 0;
const MESSAGE_LABEL_VALID = 1;
const MESSAGE_LABEL_TRASH = 2;
const MESSAGE_LABEL_INVALID = 3;

export interface GraffitiDecentralizedOptions {
  identityCreatorEndpoint?: string;
  defaultInboxEndpoints?: string[];
}

// @ts-ignore
export class GraffitiDecentralized implements Pick<
  Graffiti,
  "post" | "get" | "delete"
> {
  protected readonly dids = new DecentralizedIdentifiers();
  protected readonly authorization = new Authorization();
  protected readonly storageBuckets = new StorageBuckets();
  protected readonly inboxes = new Inboxes();

  protected readonly stringEncoder = new StringEncoder();
  protected readonly contentAddresses = new ContentAddresses();
  protected readonly channelAttestations = new ChannelAttestations();
  protected readonly allowedAttestations = new AllowedAttestations();

  protected readonly handles = new Handles({ dids: this.dids });
  protected readonly objectEncoding = new ObjectEncoding({
    stringEncoder: this.stringEncoder,
    contentAddresses: this.contentAddresses,
    channelAttestations: this.channelAttestations,
    allowedAttestations: this.allowedAttestations,
  });

  protected readonly defaultInboxEndpoints: string[];
  protected readonly identityCreatorEndpoint: string;
  protected readonly sessions: Sessions;
  constructor(options?: GraffitiDecentralizedOptions, sessions?: Sessions) {
    this.defaultInboxEndpoints = options?.defaultInboxEndpoints ?? [
      "https://graffiti.actor/i/shared",
    ];
    this.identityCreatorEndpoint =
      options?.identityCreatorEndpoint ?? "https://graffiti.actor/create";

    this.sessions =
      sessions ??
      new Sessions({
        dids: this.dids,
        authorization: this.authorization,
        storageBuckets: this.storageBuckets,
        inboxes: this.inboxes,
      });
    this.sessionEvents = this.sessions.sessionEvents;
  }

  readonly actorToHandle: Graffiti["actorToHandle"] =
    this.handles.actorToHandle.bind(this.handles);
  readonly handleToActor: Graffiti["handleToActor"] =
    this.handles.handleToActor.bind(this.handles);
  readonly sessionEvents: Graffiti["sessionEvents"];

  login: Graffiti["login"] = async (actor?: string) => {
    try {
      await this.login_(actor);
    } catch (e) {
      const loginError: GraffitiLoginEvent = new CustomEvent("login", {
        detail: {
          error: e instanceof Error ? e : new Error(String(e)),
        },
      });
      this.sessionEvents.dispatchEvent(loginError);
    }
  };
  protected async login_(proposedActor?: string) {
    let proposedHandle: string | undefined;
    try {
      proposedHandle = proposedActor
        ? await this.actorToHandle(proposedActor)
        : undefined;
    } catch (error) {
      console.error("Error fetching handle for actor:", error);
    }

    let handle: string | undefined;
    if (typeof window !== "undefined") {
      // Browser environment
      // TODO:
      // - Make this a full UI
      // - Add an option for account creation as well
      // - Use https://github.com/graffiti-garden/modal
      handle =
        window.prompt("Please enter your handle:", proposedHandle) || undefined;
    } else {
      // Node.js environment
      const readline = await import("readline").catch((e) => {
        throw new Error(
          "Unrecognized environment: neither window nor readline",
        );
      });

      console.log(
        "If you do not already have a Graffiti handle, you can create one here:",
      );
      console.log(this.identityCreatorEndpoint);
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      handle = await new Promise((resolve) => {
        rl.question(
          `Please enter your handle${proposedHandle ? ` (default: ${proposedHandle})` : ""}: `,
          (input) => {
            rl.close();
            resolve(input || proposedHandle);
          },
        );
      });
    }

    if (!handle) {
      throw new Error("No handle provided");
    }

    // Convert the handle to an actor
    const actor = await this.handleToActor(handle);

    await this.sessions.login(actor);
  }

  logout: Graffiti["logout"] = async (session) => {
    await this.sessions.logout(session.actor);
  };

  async post<Schema extends JSONSchema>(
    partialObject: GraffitiPostObject<Schema>,
    session: GraffitiSession,
  ): Promise<GraffitiObject<Schema>> {
    const resolvedSession = this.sessions.resolveSession(session);
    if (!resolvedSession) throw new Error("Not logged in");

    // Encode the object
    const { object, tags, objectBytes, allowedTickets } =
      await this.objectEncoding.encode<Schema>(partialObject, session.actor);

    // Generate a random key under which to store the object
    // If the object is private, this means no one will be able to
    // fetch the object, even if they know its URL.
    // If the object is public but in some secret channel, the storage
    // location means the object can be moved around or "rotated"
    // without changing its URL.
    const storageBucketKeyBytes = randomBytes();
    const storageBucketKey = await this.stringEncoder.encode(
      STRING_ENCODER_METHOD_BASE64URL,
      storageBucketKeyBytes,
    );

    // Store the object at the random key
    await this.storageBuckets.put(
      resolvedSession.storageBucket.serviceEndpoint,
      storageBucketKey,
      objectBytes,
      resolvedSession.storageBucket.token,
    );

    // Announce the object, its key,
    // and other metadata to appropriate inboxes
    await this.announceObject(
      object,
      tags,
      allowedTickets,
      storageBucketKey,
      session,
    );

    return object;
  }

  async get<Schema extends JSONSchema>(
    url: string | GraffitiObjectUrl,
    schema: Schema,
    session?: GraffitiSession | null,
  ): Promise<GraffitiObject<Schema>> {
    let services: { token?: string; serviceEndpoint: string }[];
    const validator = await compileGraffitiObjectSchema(schema);

    if (session) {
      // If logged in, first search one's
      // personal inbox, then any shared inboxes
      const resolvedSession = this.sessions.resolveSession(session);
      if (!resolvedSession) throw new Error("Invalid session");
      services = [
        resolvedSession.personalInbox,
        ...resolvedSession.sharedInboxes,
      ];
    } else {
      // Otherwise, search the default inboxes
      services = this.defaultInboxEndpoints.map((s) => ({
        serviceEndpoint: s,
      }));
    }

    // Search the inboxes for all objects
    // matching the tag, object.url
    const objectUrl = unpackObjectUrl(url);
    const tags = [new TextEncoder().encode(objectUrl)];
    for (const service of services) {
      let object: GraffitiObjectBase | undefined = undefined;

      const iterator = this.querySingleEndpoint<{}>(
        service.serviceEndpoint,
        {
          tags,
          objectSchema: {},
        },
        service.token,
        session?.actor,
      );

      for await (const result of iterator) {
        if (result.object.url !== objectUrl) continue;
        if (result.tombstone) {
          object = undefined;
        } else {
          object = result.object;
        }
      }

      if (object) {
        if (!validator(object)) {
          throw new GraffitiErrorSchemaMismatch(
            "Object exists but does not match the supplied schema",
          );
        }

        return object;
      }
    }

    throw new GraffitiErrorNotFound("Object not found");
  }

  delete: Graffiti["delete"] = async (url, session) => {
    const resolvedSession = this.sessions.resolveSession(session);
    if (!resolvedSession) throw new Error("Invalid session");

    const objectUrl = unpackObjectUrl(url);

    const { actor } = decodeObjectUrl(objectUrl);
    if (actor !== session.actor) {
      throw new GraffitiErrorForbidden("Cannot delete someone else's actor");
    }

    // Look in one's personal inbox for the object
    const iterator = this.querySingleEndpoint<{}>(
      resolvedSession.personalInbox.serviceEndpoint,
      {
        tags: [new TextEncoder().encode(objectUrl)],
        objectSchema: {},
      },
      resolvedSession.personalInbox.token,
    );
    let existing:
      | {
          object: GraffitiObjectBase;
          storageBucketKey: string;
          tags: Uint8Array[];
          allowedTickets: Uint8Array[] | undefined;
        }
      | undefined = undefined;
    for await (const result of iterator) {
      if (result.object.url !== objectUrl) continue;
      if (result.tombstone) {
        existing = undefined;
      } else {
        existing = result;
      }
    }
    if (!existing) {
      throw new GraffitiErrorNotFound(`Object ${objectUrl} not found`);
    }
    const { object, storageBucketKey, tags, allowedTickets } = existing;

    // Delete the object from the actor's own storage bucket
    await this.storageBuckets.delete(
      resolvedSession.storageBucket.serviceEndpoint,
      storageBucketKey,
      resolvedSession.storageBucket.token,
    );

    // Announce the deletion to all inboxes
    await this.announceObject(
      object,
      tags,
      allowedTickets,
      storageBucketKey,
      session,
      true,
    );

    return object;
  };

  async announceObject(
    object: GraffitiObjectBase,
    tags: Uint8Array[],
    allowedTickets: Uint8Array[] | undefined,
    storageBucketKey: string,
    session: GraffitiSession,
    tombstone?: boolean,
  ): Promise<void> {
    const resolvedSession = this.sessions.resolveSession(session);
    if (!resolvedSession) throw new Error("Not logged in");

    const metadataBase: MessageMetadataBase = {
      [MESSAGE_DATA_STORAGE_BUCKET_KEY]: storageBucketKey,
      ...(tombstone
        ? {
            [MESSAGE_DATA_TOMBSTONE_KEY]: tombstone,
          }
        : {}),
    };

    // Send the complete object to my own personal inbox
    // along with its key and allowed tickets
    const selfMetadata: MessageMetadata = {
      ...metadataBase,
      ...(allowedTickets
        ? {
            [MESSAGE_DATA_ALLOWED_TICKETS_KEY]: allowedTickets,
          }
        : {}),
    };
    await this.inboxes.send(resolvedSession.personalInbox.serviceEndpoint, {
      [MESSAGE_TAGS_KEY]: tags,
      [MESSAGE_OBJECT_KEY]: object,
      [MESSAGE_METADATA_KEY]: dagCborEncode(selfMetadata),
    });

    const allowed = object.allowed;
    if (Array.isArray(allowed)) {
      if (!allowedTickets || allowedTickets.length !== allowed.length) {
        throw new Error(
          "If allowed actors are specified, there must be a corresponding ticket for each allowed actor",
        );
      }

      // Send the object to each allowed recipient's personal inbox
      const results = await Promise.allSettled(
        allowed.map(async (recipient, recipientIndex) => {
          // Mask the object to not include any channels
          // and only include the recipient actor on the allowed list
          const copy = JSON.parse(JSON.stringify(object)) as GraffitiObjectBase;
          const masked = maskGraffitiObject(copy, [], recipient);

          // Get the recipient's inbox
          const actorDocument = await this.dids.resolve(recipient);
          const personalInbox = actorDocument.service?.find(
            (service) =>
              service.type === DID_SERVICE_TYPE_GRAFFITI_INBOX &&
              service.id === DID_SERVICE_ID_GRAFFITI_PERSONAL_INBOX,
          );
          if (!personalInbox) {
            throw new Error(
              `Recipient ${recipient} does not have a personal inbox`,
            );
          }
          if (typeof personalInbox.serviceEndpoint !== "string") {
            throw new Error(
              `Recipient ${recipient} does not have a valid personal inbox endpoint`,
            );
          }

          // Announce to the inbox
          const privateMetadata: MessageMetadata = {
            ...metadataBase,
            [MESSAGE_DATA_ALLOWED_TICKET_KEY]: allowedTickets[recipientIndex],
            [MESSAGE_DATA_ALLOWED_TICKET_INDEX_KEY]: recipientIndex,
          };
          await this.inboxes.send(personalInbox.serviceEndpoint, {
            [MESSAGE_TAGS_KEY]: tags,
            [MESSAGE_OBJECT_KEY]: masked,
            [MESSAGE_METADATA_KEY]: dagCborEncode(privateMetadata),
          });
        }),
      );

      for (const [index, result] of results.entries()) {
        if (result.status === "rejected") {
          const recipient = allowed[index];
          console.error("Error sending to recipient:", recipient);
          console.error(result.reason);
        }
      }
    } else {
      // Mask the object to not include any channels
      // and only include the recipient actor on the allowed list
      const copy = JSON.parse(JSON.stringify(object)) as GraffitiObjectBase;
      const masked = maskGraffitiObject(copy, []);
      const sharedMetadataBytes = dagCborEncode(metadataBase);

      // Send the object to each shared inbox
      const sharedInboxes = resolvedSession.sharedInboxes;
      const results = await Promise.allSettled(
        sharedInboxes.map(async (inbox) =>
          this.inboxes.send(inbox.serviceEndpoint, {
            [MESSAGE_TAGS_KEY]: tags,
            [MESSAGE_OBJECT_KEY]: masked,
            [MESSAGE_METADATA_KEY]: sharedMetadataBytes,
          }),
        ),
      );

      for (const [index, result] of results.entries()) {
        if (result.status === "rejected") {
          const inbox = sharedInboxes[index];
          console.error("Error sending to inbox:", inbox);
          console.error(result.reason);
        }
      }
    }
  }

  protected async *querySingleEndpoint<Schema extends JSONSchema>(
    inboxEndpoint: string,
    queryArguments:
      | {
          tags: Uint8Array[];
          objectSchema: Schema;
        }
      | {
          cursor: string;
        },
    inboxToken?: string | null,
    recipient?: string | null,
  ): AsyncGenerator<{
    object: GraffitiObject<Schema>;
    storageBucketKey: string;
    tags: Uint8Array[];
    allowedTickets: Uint8Array[] | undefined;
    tombstone?: boolean;
  }> {
    // TODO: fix these
    // @ts-ignore
    const iterator: MessageStream<Schema> =
      // @ts-ignore
      "tags" in queryArguments
        ? this.inboxes.query<Schema>(
            inboxEndpoint,
            queryArguments.tags,
            queryArguments.objectSchema,
            inboxToken,
          )
        : this.inboxes.continueQuery(
            inboxEndpoint,
            queryArguments.cursor,
            inboxToken,
          );

    while (true) {
      const itResult = await iterator.next();
      // Return the cursor if done
      if (itResult.done) return itResult.value;

      const result = itResult.value;

      const label = result.l;
      if (label !== MESSAGE_LABEL_VALID && label !== MESSAGE_LABEL_UNLABELED)
        continue;

      const messageId = result.id;
      const { o: object, m: metadataBytes, t: receivedTags } = result.m;

      let metadata: MessageMetadata;
      try {
        const metadataRaw = dagCborDecode(metadataBytes);
        metadata = MessageMetadataSchema.parse(metadataRaw);
      } catch (e) {
        this.inboxes.label(
          inboxEndpoint,
          messageId,
          MESSAGE_LABEL_INVALID,
          inboxToken,
        );
        continue;
      }

      const {
        [MESSAGE_DATA_STORAGE_BUCKET_KEY]: storageBucketKey,
        [MESSAGE_DATA_TOMBSTONE_KEY]: tombstone,
      } = metadata;

      const allowedTickets =
        MESSAGE_DATA_ALLOWED_TICKETS_KEY in metadata
          ? metadata[MESSAGE_DATA_ALLOWED_TICKETS_KEY]
          : undefined;

      if (label === MESSAGE_LABEL_VALID) {
        this.markSeen(object.url, storageBucketKey, messageId);
        yield {
          object,
          storageBucketKey,
          allowedTickets,
          tags: receivedTags,
        };
        continue;
      }

      // Try to validate the object
      let validationError: unknown | undefined = undefined;
      try {
        const actor = object.actor;
        const actorDocument = await this.dids.resolve(actor);
        const storageBucketService = actorDocument?.service?.find(
          (service) =>
            service.id === DID_SERVICE_ID_GRAFFITI_STORAGE_BUCKET &&
            service.type === DID_SERVICE_TYPE_GRAFFITI_STORAGE_BUCKET,
        );
        if (!storageBucketService) {
          throw new GraffitiErrorNotFound(
            `Actor ${actor} has no storage bucket service`,
          );
        }
        if (typeof storageBucketService.serviceEndpoint !== "string") {
          throw new GraffitiErrorNotFound(
            `Actor ${actor} does not have a valid storage bucket endpoint`,
          );
        }
        const storageBucketEndpoint = storageBucketService.serviceEndpoint;

        const objectBytes = await this.storageBuckets.get(
          storageBucketEndpoint,
          storageBucketKey,
          MAX_OBJECT_SIZE_BYTES,
        );

        const privateObjectInfo = allowedTickets
          ? { allowedTickets }
          : MESSAGE_DATA_ALLOWED_TICKET_KEY in metadata
            ? {
                // TODO: fix this
                recipient: recipient ?? "noone",
                allowedTicket: metadata[MESSAGE_DATA_ALLOWED_TICKET_KEY],
                allowedIndex: metadata[MESSAGE_DATA_ALLOWED_TICKET_INDEX_KEY],
              }
            : undefined;

        await this.objectEncoding.validate(
          object,
          receivedTags,
          objectBytes,
          privateObjectInfo,
        );
      } catch (e) {
        validationError = e;
      }

      if (tombstone) {
        if (validationError instanceof GraffitiErrorNotFound) {
          // It is correct
          if (inboxToken) {
            const seenMessageId = this.getSeen(object.url, storageBucketKey);
            if (seenMessageId) {
              // Label the previous message as trash
              this.inboxes
                .label(
                  inboxEndpoint,
                  messageId,
                  MESSAGE_LABEL_TRASH,
                  inboxToken,
                )
                .then(() => this.deleteSeen(object.url, storageBucketKey));
            }
            // Label the tombstone itself as trash
            this.inboxes.label(
              inboxEndpoint,
              messageId,
              MESSAGE_LABEL_TRASH,
              inboxToken,
            );
          }

          yield {
            tombstone: true,
            object,
            storageBucketKey,
            allowedTickets,
            tags: receivedTags,
          };
        } else {
          console.error("Recieved an incorrect object");
          console.error(validationError);
          this.inboxes.label(
            inboxEndpoint,
            messageId,
            MESSAGE_LABEL_INVALID,
            inboxToken,
          );
        }
      } else {
        if (validationError === undefined) {
          this.markSeen(object.url, storageBucketKey, messageId);
          this.inboxes.label(
            inboxEndpoint,
            messageId,
            MESSAGE_LABEL_VALID,
            inboxToken,
          );
          yield {
            object,
            storageBucketKey,
            tags: receivedTags,
            allowedTickets,
          };
        } else {
          console.error("Recieved an incorrect object");
          console.error(validationError);
          this.inboxes.label(
            inboxEndpoint,
            messageId,
            MESSAGE_LABEL_INVALID,
            inboxToken,
          );
        }
      }
    }
  }

  // TODO make this a dedicated cache stored in IDB
  seen = new Map<
    string, // object url + storage bucket key
    string // messageID
  >();
  markSeen(objectUrl: string, storageBucketKey: string, messageId: string) {
    this.seen.set(
      `${encodeURIComponent(objectUrl)}:${encodeURIComponent(storageBucketKey)}`,
      messageId,
    );
  }
  getSeen(objectUrl: string, storageBucketKey: string) {
    return this.seen.get(
      `${encodeURIComponent(objectUrl)}:${encodeURIComponent(storageBucketKey)}`,
    );
  }
  deleteSeen(objectUrl: string, storageBucketKey: string) {
    this.seen.delete(
      `${encodeURIComponent(objectUrl)}:${encodeURIComponent(storageBucketKey)}`,
    );
  }
}
