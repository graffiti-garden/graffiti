import type { JSONSchema } from "json-schema-to-ts";
import {
  normalizeGraffitiReadOptions,
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
  MESSAGE_METADATA_KEY,
  MESSAGE_OBJECT_KEY,
  MESSAGE_TAGS_KEY,
  type LabeledMessage,
  type Message,
} from "../1-services/4-inboxes";
import { InboxHistory, type MessageStream, type InboxReadOptions } from "../caching/inbox-history";
import { createCache, getMessageCacheKey, type Cache } from "../caching/message-store";
import { VerificationState, type MessageState } from "./verification-state";
import { GraffitiErrorUnauthorized } from "../1-services/utilities";

import {
  StringEncoder,
  STRING_ENCODER_METHOD_BASE64URL,
} from "../2-primitives/1-string-encoding";
import { ContentAddresses, CONTENT_ADDRESS_METHOD_SHA256 } from "../2-primitives/2-content-addresses";
import {
  CHANNEL_ATTESTATION_METHOD_SHA256_ED25519,
  ChannelAttestations,
} from "../2-primitives/3-channel-attestations";
import { AllowedAttestations } from "../2-primitives/4-allowed-attestations";

import type { LoginAttempt } from "./login-attempt";
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
  stripGraffitiUrlAddendums,
  MAX_OBJECT_SIZE_BYTES,
  ObjectEncoding,
  RECORD_KIND_KEY,
  RECORD_KIND_OBJECT,
  RECORD_KIND_MEDIA,
  RecordKindSchema,
  type RecordKind,
} from "./3-object-encoding";

import { GraffitiModal } from "@graffiti-garden/modal";
import {
  type infer as infer_,
  custom,
  string,
  boolean,
  looseObject,
  literal,
  nullable,
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
  [RECORD_KIND_KEY]: optional(RecordKindSchema),
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

// Advisory labels remain on the wire until pinning replaces them. They are
// never evidence of verification or deletion in the local protocol cache.
const MESSAGE_LABEL_VALID = 1;
const MESSAGE_LABEL_TRASH = 2;
const MESSAGE_LABEL_INVALID = 4;

export interface GraffitiDecentralizedOptions {
  identityCreatorEndpoint?: string;
  defaultInboxEndpoints?: string[];
  /** For login hosts that already have the application in the preceding history entry. */
  replaceInitialLoginHistoryEntry?: boolean;
}

const CONCURRENCY = 128;
const INITIAL_READ_RETRY_MS = 1_000;
const MAX_READ_RETRY_MS = 60_000;
const MAX_READ_RETRIES_PER_POLL = 32;
const LOCAL_STORAGE_REMEMBERED_HANDLE_KEY = "graffiti-login-remembered-handle";

// @ts-ignore
export class GraffitiDecentralized implements Graffiti {
  protected readonly dids = new DecentralizedIdentifiers();
  protected readonly authorization = new Authorization();
  protected readonly storageBuckets = new StorageBuckets();
  protected readonly inboxes = new Inboxes();
  private cache_: Promise<Cache> | undefined;
  protected readonly openCache = () => this.cache_ ??= createCache();
  protected readonly inboxHistory = new InboxHistory(this.inboxes, this.openCache);
  protected readonly verification = new VerificationState();

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
          ariaLabel: "Graffiti Log In",
          useTemplateHTML: () =>
            import("./login-dialog.html").then(({ template }) => template),
          onManualClose: () => {
            const attempt = this.sessions.loginAttempts.current;
            if (attempt) this.sessions.loginAttempts.finish(attempt, {
              error: new Error("User cancelled login"),
            });
          },
        });

  protected readonly defaultInboxEndpoints: string[];
  protected readonly identityCreatorEndpoint: string;
  protected readonly replaceInitialLoginHistoryEntry: boolean;
  constructor(options?: GraffitiDecentralizedOptions) {
    this.replaceInitialLoginHistoryEntry =
      options?.replaceInitialLoginHistoryEntry ?? false;
    if (this.replaceInitialLoginHistoryEntry) {
      this.sessions.initialAuthorizationNavigation = "replace";
    }
    this.defaultInboxEndpoints = options?.defaultInboxEndpoints ?? [
      "https://graffiti.actor/i/shared",
    ];
    this.identityCreatorEndpoint =
      options?.identityCreatorEndpoint ?? "https://graffiti.actor/create";

    this.sessions.onLoginFinish = () => this.modal?.close();
    if (this.modal) {
      this.sessions.onLoginError = async (attempt, error, actor) => {
        alert("Login failed: " + error.message);
        let handle: string | undefined;
        try {
          if (actor) handle = await this.actorToHandle(actor);
        } catch (error) {
          console.error("Failed to load handle from actor:", error);
        }
        await this.showLogin(attempt, handle);
      };
    }

    this.sessionEvents.addEventListener("login", async (event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as GraffitiLoginEvent["detail"];
      if (detail.error) return;
      const actor = detail.session.actor;

      let handle: string | undefined;
      try {
        handle = await this.actorToHandle(actor);
      } catch (error) {
        console.error("Failed to load handle from actor:", error);
      }

      if (handle) {
        this.rememberHandleInBrowserStorage(handle);
      }
    });

    // If any methods throw an unauthorized error,
    // log out the used session
    for (const method of [
      "post",
      "get",
      "delete",
      "postMedia",
      "getMedia",
      "deleteMedia",
    ]) {
      const fn = (this as any)[method];
      (this as any)[method] = async (...args: unknown[]) => {
        try {
          return await fn(...args);
        } catch (e) {
          const session = args[args.length - 1] as any;
          await this.tryLogoutIfUnauthorized(e, session);
          throw e;
        }
      };
    }
  }

  readonly actorToHandle: Graffiti["actorToHandle"] =
    this.handles.actorToHandle.bind(this.handles);
  readonly handleToActor: Graffiti["handleToActor"] =
    this.handles.handleToActor.bind(this.handles);
  readonly sessionEvents: Graffiti["sessionEvents"] =
    this.sessions.sessionEvents;

  login: Graffiti["login"] = async (options) => {
    let attempt: LoginAttempt;
    try {
      attempt = this.sessions.loginAttempts.begin(options?.state);
    } catch (error) {
      this.sessionEvents.dispatchEvent(new CustomEvent("login", {
        detail: {
          error,
          state: options?.state,
        },
      }));
      return;
    }
    let proposedHandle: string | undefined;
    try {
      if (options?.actor) proposedHandle = await this.actorToHandle(options.actor);
    } catch (error) {
      console.error("Error fetching handle for actor:", error);
    }
    await this.showLogin(attempt, proposedHandle);
  };

  private async showLogin(attempt: LoginAttempt, proposedHandle?: string) {
    if (this.sessions.loginAttempts.current !== attempt) return;
    try {
      await this.login_(attempt, proposedHandle);
    } catch (error) {
      this.sessions.loginAttempts.finish(attempt, {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  protected async login_(attempt: LoginAttempt, proposedHandle?: string) {
    if (typeof window !== "undefined") {
      let template: HTMLElement | undefined;
      let focusAfterOpen: HTMLElement | null = null;
      if (proposedHandle !== undefined) {
        template = await this.modal?.displayTemplate("graffiti-login-handle");
        if (this.sessions.loginAttempts.current !== attempt) return;
        const input = template?.querySelector(
          "#username",
        ) as HTMLInputElement | null;
        const rememberedHandle =
          proposedHandle || this.getRememberedHandleFromBrowserStorage();
        if (input) input.value = rememberedHandle ?? "";
        input?.addEventListener("focus", () => input?.select());
        focusAfterOpen = input;

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
              this.showLogin(attempt, "");
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
              this.showLogin(attempt, handle);
              return;
            }

            try {
              await this.sessions.login(actor, attempt);
            } catch (e) {
              alert("Error logging in.");
              console.error(e);
              this.showLogin(attempt, handle);
            }
          });
        template
          ?.querySelector("#graffiti-login-forgot")
          ?.addEventListener("click", (e) => {
            e.preventDefault();
            void this.loginWithoutHandle(attempt).catch((error) => {
              this.sessions.loginAttempts.finish(attempt, {
                error: error instanceof Error ? error : new Error(String(error)),
              });
            });
          });
      } else {
        template = await this.modal?.displayTemplate("graffiti-login-welcome");
        if (this.sessions.loginAttempts.current !== attempt) return;
        template
          ?.querySelector("#graffiti-login-existing")
          ?.addEventListener("click", (e) => {
            e.preventDefault();
            this.showLogin(attempt, "");
          });
      }

      const createUrl = new URL(this.identityCreatorEndpoint);
      createUrl.searchParams.set(
        "redirect_uri",
        encodeURIComponent(this.sessions.loginAttempts.returnUrl(attempt)),
      );
      const createLink = template?.querySelector<HTMLAnchorElement>(
        "#graffiti-login-new",
      );
      createLink?.setAttribute("href", createUrl.toString());
      if (proposedHandle === undefined) focusAfterOpen = createLink ?? null;
      createLink?.addEventListener("click", (event) => {
        if (this.sessions.loginAttempts.current !== attempt) event.preventDefault();
        else this.sessions.loginAttempts.save(attempt);
      });
      if (this.replaceInitialLoginHistoryEntry) {
        createLink?.addEventListener("click", (event) => {
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) return;
          event.preventDefault();
          window.location.replace(createUrl.toString());
        });
      }

      if (this.sessions.loginAttempts.current !== attempt) return;
      await this.modal?.open();
      focusAfterOpen?.focus();
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

      await this.sessions.login(actor, attempt);
    }
  }

  protected async loginWithoutHandle(attempt: LoginAttempt) {
    const template = await this.modal?.displayTemplate("graffiti-login-provider");
    if (this.sessions.loginAttempts.current !== attempt) return;
    const defaultProvider = new URL("/", this.identityCreatorEndpoint);
    const provider = template?.querySelector("#graffiti-provider") as HTMLInputElement | null;
    if (provider) provider.value = defaultProvider.host;
    provider?.addEventListener("focus", () => provider.select());

    template
      ?.querySelector("#graffiti-login-provider-form")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        try {
          if (this.sessions.loginAttempts.current !== attempt) return;
          const domain = provider?.value.trim() ?? "";
          const origin = domain === defaultProvider.host
            ? defaultProvider
            : new URL(`https://${domain}`);
          if (
            !origin.hostname || origin.username || origin.password ||
            origin.pathname !== "/" || origin.search || origin.hash
          ) throw new Error("Invalid provider domain");

          const url = new URL("/forgot-handle", origin);
          url.searchParams.set("redirect_uri", this.sessions.loginAttempts.returnUrl(attempt));
          this.sessions.loginAttempts.save(attempt);
          if (this.replaceInitialLoginHistoryEntry) {
            window.location.replace(url.toString());
          } else {
            window.location.assign(url.toString());
          }
        } catch {
          alert("Enter a valid provider domain.");
        }
      });

    template
      ?.querySelector("#graffiti-login-provider-back")
      ?.addEventListener("click", (event) => {
        event.preventDefault();
        void this.showLogin(attempt, "");
      });

    if (this.sessions.loginAttempts.current !== attempt) return;
    await this.modal?.open();
    provider?.focus();
  }

  protected rememberHandleInBrowserStorage(handle: string) {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(LOCAL_STORAGE_REMEMBERED_HANDLE_KEY, handle);
    } catch (error) {
      console.error("Failed to remember handle in browser storage:", error);
    }
  }

  protected getRememberedHandleFromBrowserStorage() {
    if (typeof window === "undefined") return undefined;

    try {
      return (
        window.localStorage.getItem(LOCAL_STORAGE_REMEMBERED_HANDLE_KEY) ??
        undefined
      );
    } catch (error) {
      console.error("Failed to load handle from browser storage:", error);
      return undefined;
    }
  }

  logout: Graffiti["logout"] = async (session, options) => {
    await this.sessions.logout(session.actor, options);
  };

  post = <Schema extends JSONSchema>(...args: Parameters<typeof Graffiti.prototype.post<Schema>>) =>
    this.postRecord<Schema>(RECORD_KIND_OBJECT, ...args);

  protected async postRecord<Schema extends JSONSchema>(
    kind: RecordKind | undefined,
    ...args: Parameters<typeof Graffiti.prototype.post<Schema>>
  ) {
    const [partialObject, session] = args;
    const resolvedSession = this.sessions.resolveSession(session);

    // Encode the object
    const { object, tags, objectBytes, allowedTickets } =
      await this.objectEncoding.encode<Schema>(partialObject, session.actor, kind);

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
      kind,
    );
    return object;
  }

  get = <Schema extends JSONSchema>(...args: Parameters<typeof Graffiti.prototype.get<Schema>>) =>
    this.getRecord<Schema>(RECORD_KIND_OBJECT, ...args);

  protected async getRecord<Schema extends JSONSchema>(
    kind: RecordKind,
    ...args: Parameters<typeof Graffiti.prototype.get<Schema>>
  ) {
    const [url, schema, options] = args;
    const { session, refresh = false } = normalizeGraffitiReadOptions(options);
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
    const objectUrl = stripGraffitiUrlAddendums(unpackObjectUrl(url));
    const tags = [new TextEncoder().encode(objectUrl)];
    for (const service of services) {
      // Verified objects belong to Graffiti, not to the inbox query cache.
      // A cache miss (including a known deletion) still queries the inbox.
      if (!refresh) {
        const entries = await this.verification.read(objectUrl);
        for (const entry of entries) {
          if (entry.scope !== (session?.actor ?? null) || entry.inbox !== service.serviceEndpoint || entry.status !== "verified") continue;
          const message = await (await this.openCache()).messages.get(getMessageCacheKey(entry.inbox, entry.id));
          // Cache eviction is a miss, not evidence that the object was deleted.
          if (!message || await this.digestMessage(message.m) !== entry.digest) continue;
          const metadata = MessageMetadataSchema.parse(dagCborDecode(message.m.m));
          if (metadata[MESSAGE_DATA_TOMBSTONED_MESSAGE_ID_KEY] ||
            (metadata[RECORD_KIND_KEY] !== undefined && metadata[RECORD_KIND_KEY] !== kind)) continue;
          const object = message.m.o;
          if (!validator(object)) throw new GraffitiErrorSchemaMismatch("Object exists but does not match the supplied schema");
          return structuredClone(object);
        }
      }
      let object: GraffitiObjectBase | undefined = undefined;

      const iterator = this.querySingleEndpoint<{}>(
        service.serviceEndpoint,
        {
          tags,
          objectSchema: {},
        },
        service.token,
        session?.actor,
        { refresh: true },
      );

      for await (const result of iterator) {
        if ("error" in result) throw result.error;
        if (result.object.url !== objectUrl) continue;
        if (result.kind !== undefined && result.kind !== kind) continue;
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

        return structuredClone(object);
      }
    }

    throw new GraffitiErrorNotFound("Object not found");
  }

  delete: Graffiti["delete"] = (...args) => this.deleteRecord(RECORD_KIND_OBJECT, ...args);

  protected async deleteRecord(kind: RecordKind, ...[url, session]: Parameters<Graffiti["delete"]>) {
    const resolvedSession = this.sessions.resolveSession(session);

    const objectUrl = stripGraffitiUrlAddendums(unpackObjectUrl(url));

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
      session.actor,
    );
    let existing: SingleEndpointQueryResult<{}> | undefined;
    for await (const result of iterator) {
      if ("error" in result) throw result.error;
      if (result.object.url !== objectUrl) continue;
      if (result.kind !== undefined && result.kind !== kind) continue;
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

    await this.verification.deleted(object.url, storageBucketKey);

    // Announce the deletion to all inboxes
    await this.announceObject(
      object,
      tags,
      allowedTickets,
      storageBucketKey,
      session,
      existing.kind,
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
  }

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
      new Uint8Array(await media.data.arrayBuffer()),
      resolvedSession.storageBucket.token,
    );

    // Store the descriptor as media, outside the ordinary object API.
    const { url } = await this.postRecord<typeof MEDIA_OBJECT_SCHEMA>(
      RECORD_KIND_MEDIA,
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
    const [mediaUrl, accept, options] = args;
    const { session, refresh = false } = normalizeGraffitiReadOptions(options);

    if (
      accept?.maxBytes !== undefined &&
      (!Number.isSafeInteger(accept.maxBytes) || accept.maxBytes < 0)
    ) {
      throw new TypeError("maxBytes must be a nonnegative safe integer");
    }

    const object = await this.getRecord<typeof MEDIA_OBJECT_SCHEMA>(
      RECORD_KIND_MEDIA,
      mediaUrl,
      MEDIA_OBJECT_SCHEMA,
      { session, refresh },
    );

    const { key, type, size } = object.value;

    if (accept?.maxBytes !== undefined && size > accept.maxBytes) {
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
      refresh ? "no-cache" : "default",
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

    const result = await this.deleteRecord(RECORD_KIND_MEDIA, mediaUrl, session);

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
    refresh = true,
  ): GraffitiObjectStream<Schema> {
    const lastTombstoneState = new Map<string, boolean>();

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
                objectSchema: schema,
              }
            : {
                tags,
                objectSchema: schema,
              },
          i.token,
          session?.actor,
          { refresh },
        );
      },
    );

    const indexedIteratorNexts = iterators.map<
      Promise<IndexedSingleEndpointQueryResult<Schema>>
    >((it, index) => indexedSingleEndpointQueryNext<Schema>(it, index));
    let active = indexedIteratorNexts.length;

    try {
      while (active > 0) {
        const next: IndexedSingleEndpointQueryResult<Schema> =
          await Promise.race<any>(indexedIteratorNexts);
        if (next.error !== undefined) {
          if (
            next.error instanceof GraffitiErrorCursorExpired ||
            next.error instanceof GraffitiErrorInvalidSchema
          ) throw next.error;
          // Remove it from the race
          indexedIteratorNexts[next.index] = new Promise(() => {});
          active--;
          yield {
            error: next.error,
            origin: allInboxes[next.index].serviceEndpoint,
          };
          this.tryLogoutIfUnauthorized(next.error, session);
        } else if (next.result.done) {
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
          const item = next.result.value;
          if ("error" in item) {
            // An object failure does not remove this inbox from the stream.
            yield { error: item.error, origin: allInboxes[next.index].serviceEndpoint };
            continue;
          }
          if (item.kind === RECORD_KIND_MEDIA) continue;
          const { object, tombstone, tags: receivedTags } = item;
          // Inbox announcements can omit channel names, so recover the queried
          // channels from their tags before applying the usual object mask.
          const matchedChannels = channels.filter((_, index) =>
            receivedTags.some(
              (receivedTag) =>
                tags[index].length === receivedTag.length &&
                tags[index].every((byte, i) => byte === receivedTag[i]),
            ),
          );
          if (matchedChannels.length === 0) {
            yield {
              error: new Error("Inbox returned object without matching channels"),
              origin: allInboxes[next.index].serviceEndpoint,
            };
            continue;
          }
          const maskedObject = maskGraffitiObject(
            { ...object, channels: matchedChannels },
            matchedChannels,
            session?.actor,
          ) as typeof object;
          // The same inbox item can arrive through multiple inboxes.
          const deleted = tombstone === true;
          if (lastTombstoneState.get(object.url) === deleted) continue;
          lastTombstoneState.set(object.url, deleted);
          yield deleted
            ? { tombstone: true, object: maskedObject }
            : { object: maskedObject };
        }
      }
    } catch (e) {
      this.tryLogoutIfUnauthorized(e, session);
      throw e;
    } finally {
      await Promise.all(
        iterators.map<Promise<void>>(async (it) => {
          await it.return("");
        }),
      );
    }

    return {
      cursor: JSON.stringify({
        channels,
        cursors,
        schema,
      } satisfies infer_<typeof CursorSchema>),
    };
  }

  discover: Graffiti["discover"] = (...args) => {
    const [channels, schema, options] = args;
    const { session, refresh = true } = normalizeGraffitiReadOptions(options);
    return this.discoverMeta<(typeof args)[1]>(channels, schema, {}, session, refresh);
  };

  // @ts-ignore
  continueDiscover: Graffiti["continueDiscover"] = (...args) => {
    const [cursor, options] = args;
    const { session, refresh = true } = normalizeGraffitiReadOptions(options);
    // Extract the channels from the cursor
    let channels: string[];
    let cursors: { [endpoint: string]: string };
    let schema: JSONSchema;
    try {
      const json = JSON.parse(cursor);
      const parsed = CursorSchema.parse(json);
      channels = parsed.channels;
      cursors = parsed.cursors;
      schema = parsed.schema;
    } catch (error) {
      return (async function* () {
        throw new GraffitiErrorCursorExpired("Invalid cursor");
      })();
    }
    return this.discoverMeta<JSONSchema>(channels, schema, cursors, session, refresh);
  };

  protected tryLogoutIfUnauthorized(
    e: unknown,
    session?: GraffitiSession | null,
  ) {
    if (e instanceof GraffitiErrorUnauthorized && session) {
      this.sessions.forget(session.actor);
    }
  }

  async announceObject(
    object: GraffitiObjectBase,
    tags: Uint8Array[],
    allowedTickets: Uint8Array[] | undefined,
    storageBucketKey: string,
    session: GraffitiSession,
    kind?: RecordKind,
    priorAnnouncements?: MessageMetadataAnnouncements,
  ): Promise<void> {
    const resolvedSession = this.sessions.resolveSession(session);

    const metadataBase: MessageMetadataBase = {
      // Retain kind for cached reads and tombstones after the record is gone.
      // Initial validation checks it against the stored record's kind.
      ...(kind === undefined ? {} : { [RECORD_KIND_KEY]: kind }),
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
          objectSchema: Schema;
        },
    inboxToken?: string | null,
    recipient?: string | null,
    options?: InboxReadOptions,
  ): SingleEndpointQueryIterator<Schema> {
    let pending = new Map<string, infer_<typeof PendingReadSchema>>();
    let retryMessages: LabeledMessage<Schema>[] = [];
    let deferred = false;
    if ("cursor" in queryArguments) {
      let checkpoint: infer_<typeof SingleEndpointCursorSchema>;
      try {
        checkpoint = SingleEndpointCursorSchema.parse(JSON.parse(queryArguments.cursor));
      } catch {
        throw new GraffitiErrorCursorExpired("Invalid discovery checkpoint");
      }
      if (checkpoint.scope !== (recipient ?? null)) throw new GraffitiErrorCursorExpired("Discovery reader changed");
      queryArguments = { ...queryArguments, cursor: checkpoint.cursor };
      pending = new Map(checkpoint.pending.map((retry) => [retry.id, retry]));
      // Eligibility is checked once per poll. Never sleep or retry twice in
      // this stream. Oldest due reads go first so a failing read cannot starve others.
      const now = Date.now();
      const due = [...pending.values()]
        .filter((retry) => retry.retryAt <= now)
        .sort((a, b) => a.retryAt - b.retryAt)
        .slice(0, MAX_READ_RETRIES_PER_POLL);
      deferred = due.length < pending.size;
      if (due.length) {
        const messages = await Promise.all(due.map(async retry => {
          const entry = (await this.verification.read(retry.url)).find(entry =>
            entry.scope === (recipient ?? null) && entry.inbox === inboxEndpoint && entry.id === retry.id);
          if (!entry) throw new GraffitiErrorCursorExpired("Pending announcement is no longer cached");
          const message = await (await this.openCache()).messages.get(getMessageCacheKey(entry.inbox, entry.id));
          if (!message || message.m.o.url !== retry.url || await this.digestMessage(message.m) !== entry.digest) {
            throw new GraffitiErrorCursorExpired("Pending announcement is no longer cached");
          }
          return message;
        }));
        const matches = await compileGraffitiObjectSchema<Schema>(queryArguments.objectSchema);
        retryMessages = messages.map((message) => {
          const object = message.m.o;
          if (!matches(object)) throw new GraffitiErrorCursorExpired("Cached message no longer matches discovery");
          return { ...message, m: { ...message.m, o: object } };
        });
      }
    }

    const iterator: MessageStream<Schema> =
      "tags" in queryArguments
        ? this.inboxHistory.query<Schema>(
            inboxEndpoint,
            queryArguments.tags,
            queryArguments.objectSchema,
            inboxToken,
            options,
          )
        : this.inboxHistory.continueQuery<Schema>(
            inboxEndpoint,
            queryArguments.cursor,
            inboxToken,
            options,
          );
    const inFlight: Promise<
      | { id: string; url: string; result: SingleEndpointQueryItem<Schema> | void }
      | { error: unknown }
    >[] = [];
    let doneValue: string | null = null;

    try {
      while (true) {
        // Fill up the in-flight queue of queries up to the concurrency limit
        while (doneValue === null && inFlight.length < CONCURRENCY) {
          // Graffiti supplies due cached reads before the ordinary continuation.
          const retryMessage = retryMessages.shift();
          const itResult: IteratorResult<LabeledMessage<Schema>, string> = retryMessage
            ? { done: false, value: retryMessage }
            : await iterator.next();
          if (itResult.done) {
            doneValue = itResult.value;
            break;
          }

          // Capture rejections immediately, even if another read is pending
          // or the caller closes before reaching this result.
          const processPromise = this.processOneMessage<Schema>(
            inboxEndpoint,
            itResult.value,
            inboxToken,
            recipient,
          ).then(
            (result) => ({ id: itResult.value.id, url: itResult.value.m.o.url, result }),
            (error: unknown) => ({ error }),
          );

          inFlight.push(processPromise);
        }

        // Process something from the queue
        const nextProcessedPromise = inFlight.shift();

        if (!nextProcessedPromise) {
          if (doneValue !== null) {
            if (deferred && pending.size) {
              yield { error: new Error("Some object reads are awaiting retry"), retryable: true };
            }
            // Each continuation keeps its own pending IDs. Another consumer's
            // successful retry must not consume this consumer's delivery.
            return JSON.stringify({
              version: 2,
              scope: recipient ?? null,
              cursor: doneValue,
              pending: [...pending.values()],
            } satisfies infer_<typeof SingleEndpointCursorSchema>);
          }

          throw new Error("Process queue empty but no return value");
        }

        const processed = await nextProcessedPromise;
        if ("error" in processed) throw processed.error;
        if (processed.result && "error" in processed.result && processed.result.retryable) {
          const previous = pending.get(processed.id);
          const delay = Math.min(previous ? previous.delay * 2 : INITIAL_READ_RETRY_MS, MAX_READ_RETRY_MS);
          pending.set(processed.id, { id: processed.id, url: processed.url, delay, retryAt: Date.now() + delay });
        } else {
          pending.delete(processed.id);
        }
        if (processed.result) {
          // A cached/verified result may have waited behind another read in
          // this queue while a different stream learned that its key was gone.
          if (!("error" in processed.result) && !processed.result.tombstone) {
            const { object, storageBucketKey } = processed.result;
            if ((await this.verification.read(object.url)).some(entry =>
              entry.storageKey === storageBucketKey && entry.status === "deleted")) continue;
          }
          yield processed.result;
        }
      }
    } finally {
      await iterator.return("");
    }
  }

  // Labeling is advisory and should not hold up discovery, but its failure
  // must be handled even if the caller has already stopped reading the stream.
  protected labelInboxMessage(
    inboxEndpoint: string,
    messageId: string,
    label: number,
    inboxToken?: string | null,
  ): void {
    if (!inboxToken) return;
    void this.inboxes.label(inboxEndpoint, messageId, label, inboxToken).catch(
      (error) => console.error("Could not label inbox message:", error),
    );
  }

  protected async digestMessage(message: Message<{}>): Promise<string> {
    return this.stringEncoder.encode(STRING_ENCODER_METHOD_BASE64URL,
      await this.contentAddresses.register(CONTENT_ADDRESS_METHOD_SHA256, dagCborEncode(message)));
  }

  protected async processOneMessage<Schema extends JSONSchema>(
    inboxEndpoint: string,
    message: LabeledMessage<Schema>,
    inboxToken?: string | null,
    recipient?: string | null,
  ): Promise<SingleEndpointQueryItem<Schema> | void> {
    const messageId = message.id;
    const { o: object, m: metadataBytes, t: receivedTags } = message.m;

    let metadata: MessageMetadata;
    try {
      metadata = MessageMetadataSchema.parse(dagCborDecode(metadataBytes));
    } catch (error) {
      this.labelInboxMessage(inboxEndpoint, messageId, MESSAGE_LABEL_INVALID, inboxToken);
      return { error: new Error("Invalid inbox message metadata", { cause: error }), retryable: false };
    }

    const {
      [MESSAGE_DATA_STORAGE_BUCKET_KEY]: storageBucketKey,
      [MESSAGE_DATA_TOMBSTONED_MESSAGE_ID_KEY]: tombstonedMessageId,
    } = metadata;
    const allowedTickets = MESSAGE_DATA_ALLOWED_TICKETS_KEY in metadata
      ? metadata[MESSAGE_DATA_ALLOWED_TICKETS_KEY] : undefined;
    const resultBase = {
      kind: metadata[RECORD_KIND_KEY],
      messageId,
      object,
      storageBucketKey,
      allowedTickets,
      tags: receivedTags,
      announcements: MESSAGE_DATA_ANNOUNCEMENTS_KEY in metadata
        ? metadata[MESSAGE_DATA_ANNOUNCEMENTS_KEY] : undefined,
    };
    const scope = recipient ?? null;
    const digest = await this.digestMessage(message.m);
    const known = await this.verification.read(object.url);
    const cached = known.find(entry => entry.scope === scope && entry.inbox === inboxEndpoint && entry.id === messageId);
    if (cached) {
      // The shared store keeps message bodies immutable; verification is
      // scoped to this reader and the same announcement identity. The digest
      // also protects against an ID being reused after payload eviction.
      if (cached.digest !== digest) {
        return { error: new Error("Inbox changed an existing announcement"), retryable: false };
      }
      if (cached.status === "invalid") return;
      if (cached.status === "deleted") return tombstonedMessageId ? { ...resultBase, tombstone: true } : undefined;
      if (cached.status === "verified") return resultBase;
    }
    const remember = (status: MessageState["status"]) => this.verification.remember(object.url, {
      scope, inbox: inboxEndpoint, id: messageId, digest, storageKey: storageBucketKey, status,
    });
    const retry = async (error: Error): Promise<SingleEndpointQueryItem<Schema> | void> => {
      // InboxHistory has persisted the payload. Save this reader's state
      // before advancing; each consumer still owns its pending deliveries.
      const status = await remember("pending");
      if (status === "verified") return resultBase;
      if (status === "deleted") return tombstonedMessageId ? { ...resultBase, tombstone: true } : undefined;
      if (status === "invalid") return;
      return { error, retryable: true };
    };

    // DID failures are read failures, never evidence that an object is gone.
    let storageBucketEndpoint: string;
    try {
      const actorDocument = await this.dids.resolve(object.actor);
      const service = actorDocument?.service?.find(service =>
        service.id === DID_SERVICE_ID_GRAFFITI_STORAGE_BUCKET &&
        service.type === DID_SERVICE_TYPE_GRAFFITI_STORAGE_BUCKET);
      if (!service || typeof service.serviceEndpoint !== "string") {
        throw new Error(`Actor ${object.actor} has no valid storage bucket service`);
      }
      storageBucketEndpoint = service.serviceEndpoint;
    } catch (error) {
      return retry(new Error("Could not resolve object storage bucket", { cause: error }));
    }

    let objectBytes: Uint8Array | undefined;
    try {
      objectBytes = await this.storageBuckets.get(storageBucketEndpoint, storageBucketKey, MAX_OBJECT_SIZE_BYTES);
    } catch (error) {
      if (!(error instanceof GraffitiErrorNotFound)) {
        return retry(new Error("Could not read object from storage bucket", { cause: error }));
      }
      await remember("deleted");
      this.labelInboxMessage(inboxEndpoint, messageId, MESSAGE_LABEL_TRASH, inboxToken);
      if (tombstonedMessageId) {
        // The protocol already has earlier announcements it processed. There
        // is no need to reach into the inbox cache or fetch /message again.
        if (known.some(entry => entry.inbox === inboxEndpoint && entry.id === tombstonedMessageId && entry.storageKey === storageBucketKey)) {
          this.labelInboxMessage(inboxEndpoint, tombstonedMessageId, MESSAGE_LABEL_TRASH, inboxToken);
        }
        return { ...resultBase, tombstone: true };
      }
      return;
    }

    let validationError: Error | undefined;
    try {
      if (MESSAGE_DATA_ALLOWED_TICKET_KEY in metadata && !recipient) {
        throw new GraffitiErrorForbidden("Recipient is required when allowed ticket is present");
      }
      const privateObjectInfo = allowedTickets
        ? { allowedTickets }
        : MESSAGE_DATA_ALLOWED_TICKET_KEY in metadata
          ? { recipient: recipient ?? "null", allowedTicket: metadata[MESSAGE_DATA_ALLOWED_TICKET_KEY], allowedIndex: metadata[MESSAGE_DATA_ALLOWED_TICKET_INDEX_KEY] }
          : undefined;
      await this.objectEncoding.validate(object, receivedTags, objectBytes, privateObjectInfo, metadata[RECORD_KIND_KEY]);
      if (tombstonedMessageId) validationError = new Error("Tombstone refers to an existing object");
    } catch (error) {
      validationError = new Error("Invalid inbox object", { cause: error });
    }
    if (validationError) {
      await remember("invalid");
      this.labelInboxMessage(inboxEndpoint, messageId, MESSAGE_LABEL_INVALID, inboxToken);
      return { error: validationError, retryable: false };
    }

    // A deletion observed while this read was in flight wins atomically over
    // its late success, including reads from another Graffiti instance/tab.
    if (await remember("verified") !== "verified") return;
    this.labelInboxMessage(inboxEndpoint, messageId, MESSAGE_LABEL_VALID, inboxToken);
    return resultBase;
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
  schema: union([looseObject({}), boolean()]),
});

const PendingReadSchema = strictObject({
  id: string(),
  url: string(),
  delay: int().check(nonnegative()),
  retryAt: int().check(nonnegative()),
});
const SingleEndpointCursorSchema = strictObject({
  version: literal(2),
  scope: nullable(string()),
  cursor: string(),
  pending: array(PendingReadSchema),
});

interface SingleEndpointQueryResult<Schema extends JSONSchema> {
  kind?: RecordKind;
  messageId: string;
  object: GraffitiObject<Schema>;
  storageBucketKey: string;
  tags: Uint8Array[];
  allowedTickets: Uint8Array[] | undefined;
  tombstone?: boolean;
  announcements?: MessageMetadataAnnouncements | undefined;
}
interface SingleEndpointQueryError {
  error: Error;
  // A temporary read failure needs another poll; proven invalid content does not.
  retryable: boolean;
}
type SingleEndpointQueryItem<Schema extends JSONSchema> =
  | SingleEndpointQueryResult<Schema>
  | SingleEndpointQueryError;
interface SingleEndpointQueryIterator<
  Schema extends JSONSchema,
> extends AsyncGenerator<SingleEndpointQueryItem<Schema>, string> {}
type IndexedSingleEndpointQueryResult<Schema extends JSONSchema> =
  | {
      index: number;
      error?: undefined;
      result: IteratorResult<SingleEndpointQueryItem<Schema>, string>;
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
    // Capture even fatal errors here: a prefetched next() can finish while the
    // caller is paused at a yield. The consumer propagates fatal errors when
    // resumed, without leaving a rejected promise unhandled in the meantime.
    return {
      index,
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}
