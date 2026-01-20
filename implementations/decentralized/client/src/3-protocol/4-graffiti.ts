import type { JSONSchema } from "json-schema-to-ts";
import {
  GraffitiErrorNotFound,
  maskGraffitiObject,
  type Graffiti,
  type GraffitiLoginEvent,
  type GraffitiObjectBase,
  type GraffitiSession,
  type GraffitiObject,
  unpackObjectUrl,
  compileGraffitiObjectSchema,
  GraffitiErrorSchemaMismatch,
  GraffitiErrorForbidden,
  GraffitiErrorTooLarge,
  isMediaAcceptable,
  GraffitiErrorNotAcceptable,
  GraffitiErrorCursorExpired,
  GraffitiErrorInvalidSchema,
  type GraffitiObjectStream,
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
  LABELED_MESSAGE_MESSAGE_KEY,
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
import {
  CHANNEL_ATTESTATION_METHOD_SHA256_ED25519,
  ChannelAttestations,
} from "../2-primitives/3-channel-attestations";
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

import { GraffitiModal } from "@graffiti-garden/modal";
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
  record,
  url,
} from "zod/mini";

const Uint8ArraySchema = custom<Uint8Array>(
  (v): v is Uint8Array => v instanceof Uint8Array,
);
const MESSAGE_DATA_STORAGE_BUCKET_KEY = "k";
const MESSAGE_DATA_TOMBSTONED_MESSAGE_ID_KEY = "t";
const MessageMetadataBaseSchema = strictObject({
  [MESSAGE_DATA_STORAGE_BUCKET_KEY]: string(),
  [MESSAGE_DATA_TOMBSTONED_MESSAGE_ID_KEY]: optional(string()),
});
const MESSAGE_DATA_ANNOUNCEMENT_MESSAGE_ID_KEY = "id";
const MESSAGE_DATA_ANNOUNCEMENT_ENDPOINT_KEY = "e";
const MESSAGE_DATA_ANNOUNCEMENT_ACTOR_KEY = "a";
const MessageMetadataAnnouncementsSchema = array(
  strictObject({
    [MESSAGE_DATA_ANNOUNCEMENT_MESSAGE_ID_KEY]: string(),
    [MESSAGE_DATA_ANNOUNCEMENT_ENDPOINT_KEY]: optional(url()),
    [MESSAGE_DATA_ANNOUNCEMENT_ACTOR_KEY]: optional(url()),
  }),
);
const MESSAGE_DATA_ALLOWED_TICKETS_KEY = "s";
const MESSAGE_DATA_ANNOUNCEMENTS_KEY = "n";
const MessageMetaDataSelfSchema = extend(MessageMetadataBaseSchema, {
  [MESSAGE_DATA_ALLOWED_TICKETS_KEY]: optional(array(Uint8ArraySchema)),
  [MESSAGE_DATA_ANNOUNCEMENTS_KEY]: MessageMetadataAnnouncementsSchema,
});
const MESSAGE_DATA_ALLOWED_TICKET_KEY = "a";
const MESSAGE_DATA_ALLOWED_TICKET_INDEX_KEY = "i";
const MessageMetadataPrivateSchema = extend(MessageMetadataBaseSchema, {
  [MESSAGE_DATA_ALLOWED_TICKET_KEY]: Uint8ArraySchema,
  [MESSAGE_DATA_ALLOWED_TICKET_INDEX_KEY]: int().check(nonnegative()),
});
const MessageMetadataSchema = union([
  MessageMetadataBaseSchema,
  MessageMetaDataSelfSchema,
  MessageMetadataPrivateSchema,
]);
type MessageMetadataBase = infer_<typeof MessageMetadataBaseSchema>;
type MessageMetadata = infer_<typeof MessageMetadataSchema>;
type MessageMetadataAnnouncements = infer_<
  typeof MessageMetadataAnnouncementsSchema
>;

const MESSAGE_LABEL_UNLABELED = 0;
const MESSAGE_LABEL_VALID = 1;
const MESSAGE_LABEL_TRASH = 2;
const MESSAGE_LABEL_INVALID = 3;

export interface GraffitiDecentralizedOptions {
  identityCreatorEndpoint?: string;
  defaultInboxEndpoints?: string[];
}

export class GraffitiDecentralized implements Graffiti {
  protected readonly dids = new DecentralizedIdentifiers();
  protected readonly authorization = new Authorization();
  protected readonly storageBuckets = new StorageBuckets();
  protected readonly inboxes = new Inboxes();

  protected readonly stringEncoder = new StringEncoder();
  protected readonly contentAddresses = new ContentAddresses();
  protected readonly channelAttestations = new ChannelAttestations();
  protected readonly allowedAttestations = new AllowedAttestations();

  protected readonly sessions = new Sessions({
    dids: this.dids,
    authorization: this.authorization,
    storageBuckets: this.storageBuckets,
    inboxes: this.inboxes,
  });
  protected readonly handles = new Handles({ dids: this.dids });
  protected readonly objectEncoding = new ObjectEncoding({
    stringEncoder: this.stringEncoder,
    contentAddresses: this.contentAddresses,
    channelAttestations: this.channelAttestations,
    allowedAttestations: this.allowedAttestations,
  });

  protected readonly modal: GraffitiModal | undefined =
    typeof window === "undefined"
      ? undefined
      : new GraffitiModal({
          useTemplateHTML: () =>
            import("./login-dialog.html").then(({ template }) => template),
          onManualClose: () => {
            const event = new CustomEvent("login", {
              detail: {
                error: new Error("User cancelled login"),
                manual: true,
              },
            });
            this.sessionEvents.dispatchEvent(event);
          },
        });

  protected readonly defaultInboxEndpoints: string[];
  protected readonly identityCreatorEndpoint: string;
  constructor(options?: GraffitiDecentralizedOptions) {
    this.defaultInboxEndpoints = options?.defaultInboxEndpoints ?? [
      "https://graffiti.actor/i/shared",
    ];
    this.identityCreatorEndpoint =
      options?.identityCreatorEndpoint ?? "https://graffiti.actor/create";

    this.sessionEvents.addEventListener("login", async (event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as GraffitiLoginEvent["detail"];
      if (
        detail.error !== undefined &&
        !("manual" in detail && detail.manual)
      ) {
        alert("Login failed: " + detail.error.message);
        const actor = detail.session?.actor;
        let handle: string | undefined;
        if (actor) {
          try {
            handle = await this.actorToHandle(actor);
          } catch (error) {
            console.error("Failed to handle actor:", error);
          }
        }
        this.login_(handle);
      }
    });
  }

  readonly actorToHandle: Graffiti["actorToHandle"] =
    this.handles.actorToHandle.bind(this.handles);
  readonly handleToActor: Graffiti["handleToActor"] =
    this.handles.handleToActor.bind(this.handles);
  readonly sessionEvents: Graffiti["sessionEvents"] =
    this.sessions.sessionEvents;

  login: Graffiti["login"] = async (actor?: string) => {
    try {
      let proposedHandle: string | undefined;
      try {
        proposedHandle = actor ? await this.actorToHandle(actor) : undefined;
      } catch (error) {
        console.error("Error fetching handle for actor:", error);
      }

      await this.login_(proposedHandle);
    } catch (e) {
      const loginError: GraffitiLoginEvent = new CustomEvent("login", {
        detail: {
          error: e instanceof Error ? e : new Error(String(e)),
        },
      });
      this.sessionEvents.dispatchEvent(loginError);
    }
  };
  protected async login_(proposedHandle?: string) {
    if (typeof window !== "undefined") {
      let template: HTMLElement | undefined;
      if (proposedHandle !== undefined) {
        template = await this.modal?.displayTemplate("graffiti-login-handle");
        const input = template?.querySelector(
          "#username",
        ) as HTMLInputElement | null;
        input?.setAttribute("value", proposedHandle);
        input?.addEventListener("focus", () => input?.select());
        new Promise<void>((r) => {
          setTimeout(() => r(), 0);
        }).then(() => {
          input?.focus();
        });

        template
          ?.querySelector("#graffiti-login-handle-form")
          ?.addEventListener("submit", async (e) => {
            e.preventDefault();
            input?.setAttribute("disabled", "true");
            const submitButton = template?.querySelector(
              "#graffiti-login-handle-submit",
            ) as HTMLButtonElement | null;
            submitButton?.setAttribute("disabled", "true");
            submitButton && (submitButton.innerHTML = "Logging in...");

            if (!input?.value) {
              alert("No handle provided");
              this.login_("");
              return;
            }

            let handle = input.value;
            if (!handle.includes(".") && !handle.startsWith("localhost")) {
              const defaultHost = new URL(this.identityCreatorEndpoint).host;
              handle = `${handle}.${defaultHost}`;
            }

            let actor: string;
            try {
              actor = await this.handleToActor(handle);
            } catch (e) {
              alert("Could not find an identity associated with that handle.");
              this.login_(handle);
              return;
            }

            try {
              await this.sessions.login(actor);
            } catch (e) {
              alert("Error logging in.");
              console.error(e);
              this.login_(handle);
            }
          });
      } else {
        template = await this.modal?.displayTemplate("graffiti-login-welcome");
        template
          ?.querySelector("#graffiti-login-existing")
          ?.addEventListener("click", (e) => {
            e.preventDefault();
            this.login_("");
          });
        new Promise<void>((r) => {
          setTimeout(() => r(), 0);
        }).then(() => {
          (
            template?.querySelector("#graffiti-login-new") as HTMLAnchorElement
          )?.focus();
        });
      }

      const createUrl = new URL(this.identityCreatorEndpoint);
      createUrl.searchParams.set(
        "redirect_uri",
        encodeURIComponent(window.location.toString()),
      );
      template
        ?.querySelector("#graffiti-login-new")
        ?.setAttribute("href", createUrl.toString());

      await this.modal?.open();
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

      const handle: string | undefined = await new Promise((resolve) => {
        rl.question(
          `Please enter your handle${proposedHandle ? ` (default: ${proposedHandle})` : ""}: `,
          (input) => {
            rl.close();
            resolve(input || proposedHandle);
          },
        );
      });

      if (!handle) {
        throw new Error("No handle provided");
      }

      // Convert the handle to an actor
      const actor = await this.handleToActor(handle);

      await this.sessions.login(actor);
    }
  }

  logout: Graffiti["logout"] = async (session) => {
    await this.sessions.logout(session.actor);
  };

  // @ts-ignore
  post: Graffiti["post"] = async (...args) => {
    const [partialObject, session] = args;
    const resolvedSession = this.sessions.resolveSession(session);

    // Encode the object
    const { object, tags, objectBytes, allowedTickets } =
      await this.objectEncoding.encode<{}>(partialObject, session.actor);

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
  };

  get: Graffiti["get"] = async (...args) => {
    const [url, schema, session] = args;
    let services: { token?: string; serviceEndpoint: string }[];
    const validator = await compileGraffitiObjectSchema(schema);

    if (session) {
      // If logged in, first search one's
      // personal inbox, then any shared inboxes
      const resolvedSession = this.sessions.resolveSession(session);
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
  };

  delete: Graffiti["delete"] = async (url, session) => {
    const resolvedSession = this.sessions.resolveSession(session);

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
    let existing: SingleEndpointQueryResult<{}> | undefined;
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
    const {
      object,
      storageBucketKey,
      tags,
      allowedTickets,
      announcements,
      messageId,
    } = existing;

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
      [
        ...(announcements ?? []),
        // Make sure we delete from our own inbox too
        {
          [MESSAGE_DATA_ANNOUNCEMENT_ACTOR_KEY]: session.actor,
          [MESSAGE_DATA_ANNOUNCEMENT_MESSAGE_ID_KEY]: messageId,
        },
      ],
    );

    return object;
  };

  postMedia: Graffiti["postMedia"] = async (...args) => {
    const [media, session] = args;

    const type = media.data.type;

    const resolvedSession = this.sessions.resolveSession(session);

    // Generate a random storage key
    const keyBytes = randomBytes();
    const key = await this.stringEncoder.encode(
      STRING_ENCODER_METHOD_BASE64URL,
      keyBytes,
    );

    // Store the media at that key
    await this.storageBuckets.put(
      resolvedSession.storageBucket.serviceEndpoint,
      key,
      await media.data.bytes(),
      resolvedSession.storageBucket.token,
    );

    // Create an object
    const { url } = await this.post<typeof MEDIA_OBJECT_SCHEMA>(
      {
        value: {
          key,
          type,
          size: media.data.size,
        },
        channels: [],
        allowed: media.allowed,
      },
      session,
    );

    return url;
  };

  getMedia: Graffiti["getMedia"] = async (...args) => {
    const [mediaUrl, accept, session] = args;

    const object = await this.get<typeof MEDIA_OBJECT_SCHEMA>(
      mediaUrl,
      MEDIA_OBJECT_SCHEMA,
      session,
    );

    const { key, type, size } = object.value;

    if (accept?.maxBytes && size > accept.maxBytes) {
      throw new GraffitiErrorTooLarge("File size exceeds limit");
    }

    // Make sure it adheres to requirements.accept
    if (accept?.types) {
      if (!isMediaAcceptable(type, accept.types)) {
        throw new GraffitiErrorNotAcceptable(
          `Unacceptable media type, ${type}`,
        );
      }
    }

    // Get the actor's storage bucket endpoint
    const actorDocument = await this.dids.resolve(object.actor);
    const storageBucketService = actorDocument?.service?.find(
      (service) =>
        service.id === DID_SERVICE_ID_GRAFFITI_STORAGE_BUCKET &&
        service.type === DID_SERVICE_TYPE_GRAFFITI_STORAGE_BUCKET,
    );
    if (!storageBucketService) {
      throw new GraffitiErrorNotFound(
        `Actor ${object.actor} has no storage bucket service`,
      );
    }
    if (typeof storageBucketService.serviceEndpoint !== "string") {
      throw new GraffitiErrorNotFound(
        `Actor ${object.actor} does not have a valid storage bucket endpoint`,
      );
    }
    const storageBucketEndpoint = storageBucketService.serviceEndpoint;

    const data = await this.storageBuckets.get(
      storageBucketEndpoint,
      key,
      size,
    );

    const blob = new Blob([data.slice()], { type });

    return {
      data: blob,
      actor: object.actor,
      allowed: object.allowed,
    };
  };

  deleteMedia: Graffiti["deleteMedia"] = async (...args) => {
    const [mediaUrl, session] = args;

    const resolvedSession = this.sessions.resolveSession(session);

    const result = await this.delete(mediaUrl, session);

    if (!("key" in result.value && typeof result.value.key === "string"))
      throw new Error(
        "Deleted object was not media: " + JSON.stringify(result, null, 2),
      );

    await this.storageBuckets.delete(
      resolvedSession.storageBucket.serviceEndpoint,
      result.value.key,
      resolvedSession.storageBucket.token,
    );
  };

  async *discoverMeta<Schema extends JSONSchema>(
    channels: string[],
    schema: Schema,
    cursors: {
      [endpoint: string]: string;
    },
    session?: GraffitiSession | null,
  ): GraffitiObjectStream<Schema> {
    const tombstones = new Map<string, boolean>();

    let allInboxes: { serviceEndpoint: string; token?: string }[];
    if (session) {
      const resolvedSession = this.sessions.resolveSession(session);
      allInboxes = [
        resolvedSession.personalInbox,
        ...resolvedSession.sharedInboxes,
      ];
    } else {
      allInboxes = this.defaultInboxEndpoints.map((e) => ({
        serviceEndpoint: e,
      }));
    }

    // Make sure all cursors are represented by an inbox
    for (const endpoint in cursors) {
      if (!allInboxes.some((i) => i.serviceEndpoint === endpoint)) {
        throw new GraffitiErrorForbidden(
          "Cursor does not match actor's inboxes",
        );
      }
    }

    // Turn the channels into tags
    const tags = await Promise.all(
      channels.map((c) =>
        this.channelAttestations.register(
          CHANNEL_ATTESTATION_METHOD_SHA256_ED25519,
          c,
        ),
      ),
    );

    const iterators: SingleEndpointQueryIterator<Schema>[] = allInboxes.map(
      (i) => {
        const cursor = cursors[i.serviceEndpoint];
        return this.querySingleEndpoint<Schema>(
          i.serviceEndpoint,
          cursor
            ? {
                cursor,
              }
            : {
                tags,
                objectSchema: schema,
              },
          i.token,
          session?.actor,
        );
      },
    );

    let indexedIteratorNexts = iterators.map<
      Promise<IndexedSingleEndpointQueryResult<Schema>>
    >(async (it, index) => indexedSingleEndpointQueryNext<Schema>(it, index));
    let active = indexedIteratorNexts.length;

    while (active > 0) {
      const next: IndexedSingleEndpointQueryResult<Schema> =
        await Promise.race<any>(indexedIteratorNexts);
      if (next.error !== undefined) {
        // Remove it from the race
        indexedIteratorNexts[next.index] = new Promise(() => {});
        active--;
        yield {
          error: next.error,
          origin: allInboxes[next.index].serviceEndpoint,
        };
      } else if (next.result.done) {
        // Store the cursor for future use
        const inbox = allInboxes[next.index];
        cursors[inbox.serviceEndpoint] = next.result.value;
        // Remove it from the race
        indexedIteratorNexts[next.index] = new Promise(() => {});
        active--;
      } else {
        // Re-arm the iterator
        indexedIteratorNexts[next.index] =
          indexedSingleEndpointQueryNext<Schema>(
            iterators[next.index],
            next.index,
          );
        const { object, tombstone, tags: receivedTags } = next.result.value;
        if (tombstone) {
          if (tombstones.get(object.url) === true) continue;
          tombstones.set(object.url, true);
          yield {
            tombstone,
            object: { url: object.url },
          };
        } else {
          // Filter already seen
          if (tombstones.get(object.url) === false) continue;

          // Fill in the matched channels
          const matchedTagIndices = tags.reduce<number[]>(
            (acc, tag, tagIndex) => {
              for (const receivedTag of receivedTags) {
                if (
                  tag.length === receivedTag.length &&
                  tag.every((b, i) => receivedTag[i] === b)
                ) {
                  acc.push(tagIndex);
                  break;
                }
              }
              return acc;
            },
            [],
          );
          const matchedChannels = matchedTagIndices.map(
            (index) => channels[index],
          );
          if (matchedChannels.length === 0) {
            yield {
              error: new Error(
                "Inbox returned object without matching channels",
              ),
              origin: allInboxes[next.index].serviceEndpoint,
            };
          }
          tombstones.set(object.url, false);
          yield {
            object: {
              ...object,
              channels: matchedChannels,
            },
          };
        }
      }
    }

    return {
      cursor: JSON.stringify({
        channels,
        cursors,
      } satisfies infer_<typeof CursorSchema>),
      continue: (session) =>
        this.discoverMeta<Schema>(channels, schema, cursors, session),
    };
  }

  discover: Graffiti["discover"] = (...args) => {
    const [channels, schema, session] = args;
    return this.discoverMeta<(typeof args)[1]>(channels, schema, {}, session);
  };

  continueDiscover: Graffiti["continueDiscover"] = (...args) => {
    const [cursor, session] = args;
    // Extract the channels from the cursor
    let channels: string[];
    let cursors: { [endpoint: string]: string };
    try {
      const json = JSON.parse(cursor);
      const parsed = CursorSchema.parse(json);
      channels = parsed.channels;
      cursors = parsed.cursors;
    } catch (error) {
      return (async function* () {
        throw new GraffitiErrorCursorExpired("Invalid cursor");
      })();
    }
    return this.discoverMeta<{}>(channels, {}, cursors, session);
  };

  async announceObject(
    object: GraffitiObjectBase,
    tags: Uint8Array[],
    allowedTickets: Uint8Array[] | undefined,
    storageBucketKey: string,
    session: GraffitiSession,
    priorAnnouncements?: MessageMetadataAnnouncements,
  ): Promise<void> {
    const resolvedSession = this.sessions.resolveSession(session);

    const metadataBase: MessageMetadataBase = {
      [MESSAGE_DATA_STORAGE_BUCKET_KEY]: storageBucketKey,
    };

    const announcements: MessageMetadataAnnouncements = [];
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

          const tombstonedMessageId = priorAnnouncements
            ? priorAnnouncements.find(
                (a) => a[MESSAGE_DATA_ANNOUNCEMENT_ACTOR_KEY] === recipient,
              )?.[MESSAGE_DATA_ANNOUNCEMENT_MESSAGE_ID_KEY]
            : undefined;

          // Announce to the inbox
          const privateMetadata: MessageMetadata = {
            ...metadataBase,
            ...(tombstonedMessageId
              ? {
                  [MESSAGE_DATA_TOMBSTONED_MESSAGE_ID_KEY]: tombstonedMessageId,
                }
              : {}),
            [MESSAGE_DATA_ALLOWED_TICKET_KEY]: allowedTickets[recipientIndex],
            [MESSAGE_DATA_ALLOWED_TICKET_INDEX_KEY]: recipientIndex,
          };
          const messageId = await this.inboxes.send(
            personalInbox.serviceEndpoint,
            {
              [MESSAGE_TAGS_KEY]: tags,
              [MESSAGE_OBJECT_KEY]: masked,
              [MESSAGE_METADATA_KEY]: dagCborEncode(privateMetadata),
            },
          );

          announcements.push({
            [MESSAGE_DATA_ANNOUNCEMENT_MESSAGE_ID_KEY]: messageId,
            [MESSAGE_DATA_ANNOUNCEMENT_ACTOR_KEY]: recipient,
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

      // Send the object to each shared inbox
      const sharedInboxes = resolvedSession.sharedInboxes;
      const results = await Promise.allSettled(
        sharedInboxes.map(async (inbox) => {
          const tombstonedMessageId = priorAnnouncements
            ? priorAnnouncements.find(
                (a) =>
                  a[MESSAGE_DATA_ANNOUNCEMENT_ENDPOINT_KEY] ===
                  inbox.serviceEndpoint,
              )?.[MESSAGE_DATA_ANNOUNCEMENT_MESSAGE_ID_KEY]
            : undefined;
          const metadata: MessageMetadata = {
            ...metadataBase,
            ...(tombstonedMessageId
              ? {
                  [MESSAGE_DATA_TOMBSTONED_MESSAGE_ID_KEY]: tombstonedMessageId,
                }
              : {}),
          };

          const messageId = await this.inboxes.send(inbox.serviceEndpoint, {
            ...(tombstonedMessageId
              ? {
                  [MESSAGE_DATA_TOMBSTONED_MESSAGE_ID_KEY]: tombstonedMessageId,
                }
              : {}),
            [MESSAGE_TAGS_KEY]: tags,
            [MESSAGE_OBJECT_KEY]: masked,
            [MESSAGE_METADATA_KEY]: dagCborEncode(metadata),
          });
          announcements.push({
            [MESSAGE_DATA_ANNOUNCEMENT_MESSAGE_ID_KEY]: messageId,
            [MESSAGE_DATA_ANNOUNCEMENT_ENDPOINT_KEY]: inbox.serviceEndpoint,
          });
        }),
      );

      for (const [index, result] of results.entries()) {
        if (result.status === "rejected") {
          const inbox = sharedInboxes[index];
          console.error("Error sending to inbox:", inbox);
          console.error(result.reason);
        }
      }
    }

    // Send the complete object to my own personal inbox
    // along with its key and allowed tickets
    const tombstonedMessageId = priorAnnouncements
      ? priorAnnouncements.find(
          (a) => a[MESSAGE_DATA_ANNOUNCEMENT_ACTOR_KEY] === session.actor,
        )?.[MESSAGE_DATA_ANNOUNCEMENT_MESSAGE_ID_KEY]
      : undefined;
    const selfMetadata: MessageMetadata = {
      ...metadataBase,
      ...(allowedTickets
        ? {
            [MESSAGE_DATA_ALLOWED_TICKETS_KEY]: allowedTickets,
          }
        : {}),
      ...(tombstonedMessageId
        ? {
            [MESSAGE_DATA_TOMBSTONED_MESSAGE_ID_KEY]: tombstonedMessageId,
          }
        : {}),
      [MESSAGE_DATA_ANNOUNCEMENTS_KEY]: announcements,
    };
    await this.inboxes.send(resolvedSession.personalInbox.serviceEndpoint, {
      [MESSAGE_TAGS_KEY]: tags,
      [MESSAGE_OBJECT_KEY]: object,
      [MESSAGE_METADATA_KEY]: dagCborEncode(selfMetadata),
    });
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
  ): SingleEndpointQueryIterator<Schema> {
    const iterator: MessageStream<Schema> =
      "tags" in queryArguments
        ? this.inboxes.query<Schema>(
            inboxEndpoint,
            queryArguments.tags,
            queryArguments.objectSchema,
            inboxToken,
          )
        : (this.inboxes.continueQuery(
            inboxEndpoint,
            queryArguments.cursor,
            inboxToken,
          ) as unknown as MessageStream<Schema>);

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
        [MESSAGE_DATA_TOMBSTONED_MESSAGE_ID_KEY]: tombstonedMessageId,
      } = metadata;

      const allowedTickets =
        MESSAGE_DATA_ALLOWED_TICKETS_KEY in metadata
          ? metadata[MESSAGE_DATA_ALLOWED_TICKETS_KEY]
          : undefined;
      const announcements =
        MESSAGE_DATA_ANNOUNCEMENTS_KEY in metadata
          ? metadata[MESSAGE_DATA_ANNOUNCEMENTS_KEY]
          : undefined;

      if (label === MESSAGE_LABEL_VALID) {
        yield {
          messageId,
          object,
          storageBucketKey,
          allowedTickets,
          tags: receivedTags,
          announcements,
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

        if (MESSAGE_DATA_ALLOWED_TICKET_KEY in metadata && !recipient) {
          throw new GraffitiErrorForbidden(
            `Recipient is required when allowed ticket is present`,
          );
        }
        const privateObjectInfo = allowedTickets
          ? { allowedTickets }
          : MESSAGE_DATA_ALLOWED_TICKET_KEY in metadata
            ? {
                recipient: recipient ?? "null",
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

      if (tombstonedMessageId) {
        if (validationError instanceof GraffitiErrorNotFound) {
          // Not found == The tombstone is correct
          this.inboxes
            // Get the referenced message
            .get(inboxEndpoint, tombstonedMessageId, inboxToken)
            .then((result) => {
              // Make sure that it actually references the object being deleted
              if (
                result &&
                result[LABELED_MESSAGE_MESSAGE_KEY][MESSAGE_OBJECT_KEY].url ===
                  object.url
              ) {
                // If it does, label the message as trash, it is no longer needed
                this.inboxes.label(
                  inboxEndpoint,
                  tombstonedMessageId,
                  MESSAGE_LABEL_TRASH,
                  inboxToken,
                );
              }

              // Then, label the tombstone message as trash
              this.inboxes.label(
                inboxEndpoint,
                messageId,
                MESSAGE_LABEL_TRASH,
                inboxToken,
              );
            });

          yield {
            messageId,
            tombstone: true,
            object,
            storageBucketKey,
            allowedTickets,
            tags: receivedTags,
            announcements,
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
          this.inboxes.label(
            inboxEndpoint,
            messageId,
            MESSAGE_LABEL_VALID,
            inboxToken,
          );
          yield {
            messageId,
            object,
            storageBucketKey,
            tags: receivedTags,
            allowedTickets,
            announcements,
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
}

const MEDIA_OBJECT_SCHEMA = {
  properties: {
    value: {
      properties: {
        type: { type: "string" },
        size: { type: "number" },
        key: { type: "string" },
      },
      required: ["type", "size", "key"],
    },
  },
} as const satisfies JSONSchema;

const CursorSchema = strictObject({
  cursors: record(url(), string()),
  channels: array(string()),
});

interface SingleEndpointQueryResult<Schema extends JSONSchema> {
  messageId: string;
  object: GraffitiObject<Schema>;
  storageBucketKey: string;
  tags: Uint8Array[];
  allowedTickets: Uint8Array[] | undefined;
  tombstone?: boolean;
  announcements?: MessageMetadataAnnouncements | undefined;
}
interface SingleEndpointQueryIterator<
  Schema extends JSONSchema,
> extends AsyncGenerator<SingleEndpointQueryResult<Schema>, string> {}
type IndexedSingleEndpointQueryResult<Schema extends JSONSchema> =
  | {
      index: number;
      error?: undefined;
      result: IteratorResult<SingleEndpointQueryResult<Schema>, string>;
    }
  | {
      index: number;
      error: Error;
      result?: undefined;
    };

async function indexedSingleEndpointQueryNext<Schema extends JSONSchema>(
  it: SingleEndpointQueryIterator<Schema>,
  index: number,
): Promise<IndexedSingleEndpointQueryResult<Schema>> {
  try {
    return {
      index: index,
      result: await it.next(),
    };
  } catch (e) {
    if (
      e instanceof GraffitiErrorCursorExpired ||
      e instanceof GraffitiErrorInvalidSchema
    ) {
      // Propogate these errors to the root
      throw e;
    }
    // Otherwise, silently pass them in the stream
    return {
      index,
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}
