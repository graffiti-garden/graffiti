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
  type GraffitiObjectStreamEntry,
  type GraffitiObjectStreamTombstone,
} from "@graffiti-garden/api";
import { randomBytes } from "@noble/hashes/utils.js";
import {
  encode as dagCborEncode,
  decode as dagCborDecode,
} from "@ipld/dag-cbor";

import { DecentralizedIdentifiers, DID_CACHE_TTL_MS } from "../1-services/2-dids";
import { Authorization } from "../1-services/1-authorization";
import { StorageBuckets } from "../1-services/3-storage-buckets";
import {
  Inboxes,
  MESSAGE_METADATA_KEY,
  MESSAGE_OBJECT_KEY,
  MESSAGE_TAGS_KEY,
  type InboxMessage,
  type MessageStream,
  type InboxReadOptions,
} from "../1-services/4-inboxes";
import type { InboxMessageBase } from "../1-services/4-inboxes/messages";
import { VerifiedMessages } from "./verified-messages";
import { GraffitiErrorUnauthorized } from "../1-services/utilities";

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
  literal,
  looseObject,
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
const MessageMetadataBaseSchema = strictObject({
  [RECORD_KIND_KEY]: optional(RecordKindSchema),
  [MESSAGE_DATA_STORAGE_BUCKET_KEY]: string(),
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

export interface GraffitiDecentralizedOptions {
  identityCreatorEndpoint?: string;
  defaultInboxEndpoints?: string[];
  /** For login hosts that already have the application in the preceding history entry. */
  replaceInitialLoginHistoryEntry?: boolean;
}

const CONCURRENCY = 128;
const LOCAL_STORAGE_REMEMBERED_HANDLE_KEY = "graffiti-login-remembered-handle";

// @ts-ignore
export class GraffitiDecentralized implements Graffiti {
  protected readonly dids = new DecentralizedIdentifiers();
  protected readonly authorization = new Authorization();
  protected readonly storageBuckets = new StorageBuckets();
  protected readonly inboxes = new Inboxes();
  protected readonly verifiedMessages = new VerifiedMessages();
  private readonly confirmedPins = new Set<string>();
  private readonly firstMissingRead = new Map<string, number>();

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
    try {
      await this.announceObject(
        object,
        tags,
        allowedTickets,
        storageBucketKey,
        session,
        kind,
      );
    } catch (error) {
      await this.storageBuckets.delete(resolvedSession.storageBucket.serviceEndpoint,
        storageBucketKey, resolvedSession.storageBucket.token).catch((rollbackError) =>
          console.error("Could not roll back stored object:", rollbackError));
      throw error;
    }
    await this.inboxes.invalidateReads(object.url);

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
    let services: { token?: string; serviceEndpoint: string; pin?: boolean }[];
    const validator = await compileGraffitiObjectSchema(schema);

    if (session) {
      // If logged in, first search one's
      // personal inbox, then any shared inboxes
      const resolvedSession = this.sessions.resolveSession(session);
      services = [
        { ...resolvedSession.personalInbox, pin: true },
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
      let object: GraffitiObjectBase | undefined = undefined;

      const iterator = this.querySingleEndpoint<{}>(
        service.serviceEndpoint,
        {
          tags,
          objectSchema: {},
        },
        service.token,
        session?.actor,
        { url: objectUrl, refresh, pin: service.pin },
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

    // Do not retain a negative lookup: the object may be published or reposted
    // from another device immediately after this request.
    await this.inboxes.invalidateReads(objectUrl);
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

    await this.verifiedMessages.missing(object.url, storageBucketKey);
    await this.inboxes.invalidateReads(object.url);

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

    // A reader may have repopulated its cache while announcements were in flight.
    await this.inboxes.invalidateReads(object.url);

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
    try {
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
    } catch (error) {
      await this.storageBuckets.delete(resolvedSession.storageBucket.serviceEndpoint,
        key, resolvedSession.storageBucket.token).catch((rollbackError) =>
          console.error("Could not roll back stored media:", rollbackError));
      throw error;
    }
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
    const scan = newScan(session?.actor);
    const nextCursors = { ...cursors };
    const validator = await compileGraffitiObjectSchema<Schema>(schema);

    let allInboxes: { serviceEndpoint: string; token?: string; pin?: boolean }[];
    if (session) {
      const resolvedSession = this.sessions.resolveSession(session);
      allInboxes = [
        { ...resolvedSession.personalInbox, pin: true },
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

    const iterators: SingleEndpointQueryIterator<{}>[] = allInboxes.map(
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
          { refresh, scan, pin: i.pin },
        );
      },
    );

    const render = (item: SingleEndpointQueryResult<{}>): GraffitiObjectStreamEntry<Schema> | GraffitiObjectStreamTombstone | undefined => {
      if (item.kind === RECORD_KIND_MEDIA) return;
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
      if (matchedChannels.length === 0 || !validator(object)) return;
      const maskedObject = maskGraffitiObject(
        { ...structuredClone(object), channels: matchedChannels },
        matchedChannels,
        session?.actor,
      ) as typeof object;
      // The same inbox item can arrive through multiple inboxes.
      const deleted = tombstone === true;
      if (lastTombstoneState.get(object.url) === deleted) return;
      lastTombstoneState.set(object.url, deleted);
      return deleted
        ? { tombstone: true, object: maskedObject }
        : { object: maskedObject };
    };
    const indexedIteratorNexts = iterators.map<
      Promise<IndexedSingleEndpointQueryResult<{}>>
    >((it, index) => indexedSingleEndpointQueryNext<{}>(it, index));
    let active = indexedIteratorNexts.length;

    try {
      while (active > 0) {
        const next: IndexedSingleEndpointQueryResult<{}> =
          await Promise.race<any>(indexedIteratorNexts);
        if (next.error !== undefined) {
          if (
            next.error instanceof GraffitiErrorCursorExpired ||
            next.error instanceof GraffitiErrorInvalidSchema
          ) throw next.error;
          scan.incomplete = true;
          // Remove it from the race
          indexedIteratorNexts[next.index] = new Promise(() => {});
          active--;
          yield {
            error: next.error,
            origin: allInboxes[next.index].serviceEndpoint,
          };
          this.tryLogoutIfUnauthorized(next.error, session);
        } else if (next.result.done) {
          // A retryable object error leaves this inbox's previous checkpoint
          // intact, even though its other results were delivered successfully.
          const inbox = allInboxes[next.index];
          if (next.result.value !== undefined) {
            nextCursors[inbox.serviceEndpoint] = next.result.value;
          }
          // Remove it from the race
          indexedIteratorNexts[next.index] = new Promise(() => {});
          active--;
        } else {
          // Re-arm the iterator
          indexedIteratorNexts[next.index] =
            indexedSingleEndpointQueryNext<{}>(
              iterators[next.index],
              next.index,
            );
          const item = next.result.value;
          if ("error" in item) {
            // An object failure does not remove this inbox from the stream.
            yield { error: item.error, origin: allInboxes[next.index].serviceEndpoint };
            continue;
          }
          const visible = render(item);
          if (visible) yield visible;
        }
      }
      for await (const { item, origin } of this.checkDeletionHints(scan)) {
        if ("error" in item) yield { error: item.error, origin };
        else {
          const visible = render(item);
          if (visible) yield visible;
        }
      }
      for (const [endpoint, cursor] of Object.entries(nextCursors)) {
        if (!scan.retry.has(endpoint)) cursors[endpoint] = cursor;
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
        protocol: 2,
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
    const resolved = this.sessions.resolveSession(session);
    const deleting = priorAnnouncements !== undefined;
    const metadataBase: MessageMetadataBase = {
      ...(kind === undefined ? {} : { [RECORD_KIND_KEY]: kind }),
      [MESSAGE_DATA_STORAGE_BUCKET_KEY]: storageBucketKey,
    };
    const announcements: MessageMetadataAnnouncements = [];
    const ownPins: { endpoint: string; token: string; id: string }[] = [];
    const send = async (endpoint: string, masked: GraffitiObjectBase, metadata: MessageMetadata, token?: string) => {
      const id = await this.inboxes.send(endpoint, {
        t: tags, o: masked,
        // A hint names the URL in the searchable object envelope. Neither its
        // metadata nor its object contents are trusted as deletion evidence.
        m: dagCborEncode(deleting ? { d: true } : metadata),
      });
      if (token && !deleting) {
        // Record the ID before pinning: even a lost response may have added it.
        ownPins.push({ endpoint, token, id });
        await this.inboxes.pin(endpoint, [id], token);
        this.confirmedPins.add(this.pinKey(endpoint, session.actor, id));
      }
      return id;
    };

    try {
      const allowed = object.allowed;
      const deliveries = Array.isArray(allowed)
        ? allowed.filter((recipient) => recipient !== session.actor).map(async (recipient) => {
            if (!allowedTickets || allowedTickets.length !== allowed.length) {
              throw new Error("Each allowed actor needs an allowed ticket");
            }
            const actorDocument = await this.dids.resolve(recipient);
            const inbox = actorDocument.service?.find((service) =>
              service.type === DID_SERVICE_TYPE_GRAFFITI_INBOX && service.id === DID_SERVICE_ID_GRAFFITI_PERSONAL_INBOX);
            if (typeof inbox?.serviceEndpoint !== "string") throw new Error(`Recipient ${recipient} has no personal inbox`);
            const index = allowed.indexOf(recipient);
            const id = await send(inbox.serviceEndpoint, maskGraffitiObject(structuredClone(object), [], recipient), {
              ...metadataBase, a: allowedTickets[index], i: index,
            });
            // Sending to somebody else's personal inbox remains unauthenticated.
            announcements.push({ id, a: recipient });
          })
        : resolved.sharedInboxes.map(async (inbox) => {
            const id = await send(inbox.serviceEndpoint, maskGraffitiObject(structuredClone(object), []), metadataBase, inbox.token);
            announcements.push({ id, e: inbox.serviceEndpoint });
          });
      // Settle every send before rolling back; no late successful pin can race
      // with the rollback of a different destination's failed request.
      const settled = await Promise.allSettled(deliveries);
      const failed = settled.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") {
        if (!Array.isArray(allowed)) throw failed.reason;
        // Keep existing best-effort delivery to other people's inboxes. The
        // author's own pinned copy is required even if a recipient has no DID.
        for (const result of settled) if (result.status === "rejected") {
          console.error("Could not send to recipient:", result.reason);
        }
      }
      await send(resolved.personalInbox.serviceEndpoint, object, {
        ...metadataBase, ...(allowedTickets ? { s: allowedTickets } : {}), n: announcements,
      }, resolved.personalInbox.token);
    } catch (error) {
      await Promise.allSettled(ownPins.map(async ({ endpoint, token, id }) => {
        this.confirmedPins.delete(this.pinKey(endpoint, session.actor, id));
        await this.inboxes.unpin(endpoint, [id], token);
      }));
      throw error;
    }

    if (deleting) {
      // Only remove the author's own sponsorship. Recipient pins are theirs to
      // release after their clients independently confirm the deletion.
      await Promise.all(priorAnnouncements.map(async (announcement) => {
        const inbox = announcement.a === session.actor
          ? resolved.personalInbox
          : resolved.sharedInboxes.find((inbox) => inbox.serviceEndpoint === announcement.e);
        if (inbox) {
          await this.inboxes.unpin(inbox.serviceEndpoint, [announcement.id], inbox.token);
          this.confirmedPins.delete(this.pinKey(inbox.serviceEndpoint, session.actor, announcement.id));
        }
      }));
    }
  }

  private pinKey(inbox: string, actor: string, id: string) {
    return JSON.stringify([inbox, actor, id]);
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
    options?: ProtocolReadOptions,
  ): SingleEndpointQueryIterator<{}> {
    const scan = options?.scan ?? newScan(recipient);
    const { pin, scan: _scan, ...readOptions } = options ?? {};
    const toPin = new Set<string>();
    let pinAttempted = false;
    const flushPins = async () => {
      if (pinAttempted || !toPin.size || !inboxToken || !recipient) return;
      pinAttempted = true;
      await this.inboxes.pin(inboxEndpoint, [...toPin], inboxToken);
      for (const id of toPin) this.confirmedPins.add(this.pinKey(inboxEndpoint, recipient, id));
    };
    if (pin && inboxToken && recipient) scan.personal = { endpoint: inboxEndpoint, token: inboxToken, actor: recipient };
    const iterator: MessageStream<Schema> =
      "tags" in queryArguments
        ? this.inboxes.query<Schema>(
            inboxEndpoint,
            queryArguments.tags,
            queryArguments.objectSchema,
            inboxToken,
            readOptions,
          )
        : (this.inboxes.continueQuery(
            inboxEndpoint,
            queryArguments.cursor,
            inboxToken,
            readOptions,
          ) as unknown as MessageStream<Schema>);

    const inFlight: Promise<
      | { result: SingleEndpointQueryItem<Schema> | void }
      | { error: unknown }
    >[] = [];
    let doneValue: string | null = null;
    let retryNeeded = false;

    try {
      while (true) {
        // Fill up the in-flight queue of queries up to the concurrency limit
        while (doneValue === null && inFlight.length < CONCURRENCY) {
          const itResult = await iterator.next();
          if (itResult.done) {
            doneValue = itResult.value;
            break;
          }

          // Capture rejections immediately, even if another read is pending
          // or the caller closes before reaching this result.
          const processPromise = this.processOneInboxMessage<Schema>(
            inboxEndpoint,
            itResult.value,
            inboxToken,
            recipient,
            scan,
          ).then(
            (result) => ({ result }),
            (error: unknown) => ({ error }),
          );

          inFlight.push(processPromise);
        }

        // Process something from the queue
        const nextProcessedPromise = inFlight.shift();

        if (!nextProcessedPromise) {
          if (doneValue !== null) {
            if (toPin.size && inboxToken && recipient) {
              try {
                await flushPins();
              } catch (cause) {
                retryNeeded = true;
                yield { error: new Error("Could not pin validated inbox messages", { cause }), retryable: true };
              }
            }
            if (!options?.scan) {
              for await (const { item } of this.checkDeletionHints(scan)) yield item;
            }
            return retryNeeded || scan.retry.has(inboxEndpoint) ? undefined : doneValue;
          }

          throw new Error("Process queue empty but no return value");
        }

        const processed = await nextProcessedPromise;
        if ("error" in processed) throw processed.error;
        if (processed.result) {
          // Expected object errors are results, not exceptions. Only temporary
          // failures hold back the checkpoint; invalid content can be passed over.
          if ("error" in processed.result) {
            retryNeeded ||= processed.result.retryable;
          }
          else if (pin && recipient && !this.confirmedPins.has(this.pinKey(inboxEndpoint, recipient, processed.result.messageId))) {
            toPin.add(processed.result.messageId);
          }
          yield processed.result;
        }
      }
    } finally {
      await iterator.return("");
      // A caller may stop after one result. Keep messages already delivered,
      // even though a closed stream has no place to yield a later pin error.
      await flushPins().catch((error) => console.error("Could not pin delivered inbox messages:", error));
    }
  }

  protected async processOneInboxMessage<Schema extends JSONSchema>(
    inboxEndpoint: string,
    result: InboxMessage<Schema>,
    _inboxToken?: string | null,
    recipient?: string | null,
    scan: DiscoveryScan = newScan(recipient),
  ): Promise<SingleEndpointQueryItem<Schema> | void> {
    const object = result.m.o;
    let decoded: unknown;
    try { decoded = dagCborDecode(result.m.m); }
    catch (cause) { return { error: new Error("Invalid inbox message metadata", { cause }), retryable: false }; }
    // Old deletion announcements used a message ID in `t`. It is only a hint
    // now: never fetch or trust the referenced message, key, or payload.
    if (decoded && typeof decoded === "object" &&
      (("d" in decoded && decoded.d === true) || ("t" in decoded && typeof decoded.t === "string"))) {
      const origins = scan.hints.get(object.url) ?? new Set<string>();
      origins.add(inboxEndpoint);
      scan.hints.set(object.url, origins);
      return;
    }
    const parsed = MessageMetadataSchema.safeParse(decoded);
    if (!parsed.success) return { error: new Error("Invalid inbox message metadata", { cause: parsed.error }), retryable: false };
    const metadata = parsed.data;
    const storageBucketKey = metadata.k;
    const allowedTickets = "s" in metadata ? metadata.s : undefined;
    const resultBase: SingleEndpointQueryResult<Schema> = {
      kind: metadata[RECORD_KIND_KEY], messageId: result.id, object,
      storageBucketKey, allowedTickets, tags: result.m.t,
      announcements: "n" in metadata ? metadata.n : undefined,
    };
    const state = await this.verifiedMessages.read(object.url);
    const cached = state.messages.find((entry) => entry.scope === (recipient ?? null) &&
      entry.inbox === inboxEndpoint && entry.message.id === result.id);
    if (cached && sameMessage(cached.message, result)) {
      if (cached.missing) return;
      return resultBase;
    }

    let endpoint: string;
    try { endpoint = await this.storageEndpoint(object.actor); }
    catch (cause) {
      scan.unresolved.add(object.url);
      return { error: new Error("Could not resolve object storage bucket", { cause }), retryable: true };
    }
    let bytes: Uint8Array;
    const readKey = this.pinKey(inboxEndpoint, recipient ?? "", result.id);
    try { bytes = await this.storageBuckets.get(endpoint, storageBucketKey, MAX_OBJECT_SIZE_BYTES); }
    catch (cause) {
      if (cause instanceof GraffitiErrorNotFound) {
        if (state.messages.some((entry) => entry.scope === (recipient ?? null) && entry.storageKey === storageBucketKey)) {
          // The original may have been verified through another query/inbox.
          // Record the absence, then defer the URL-level decision until the scan ends.
          await this.verifiedMessages.missing(object.url, storageBucketKey);
          const origins = scan.hints.get(object.url) ?? new Set<string>();
          origins.add(inboxEndpoint);
          scan.hints.set(object.url, origins);
          return;
        }
        // A 404 for an unverified announcement proves no deletion. Retry until
        // normal DID-cache expiry has allowed another resolution; if it is still
        // absent then, skip it so old missing announcements do not replay forever.
        const firstMissing = this.firstMissingRead.get(readKey) ?? Date.now();
        this.firstMissingRead.set(readKey, firstMissing);
        if (Date.now() - firstMissing < DID_CACHE_TTL_MS) {
          scan.unresolved.add(object.url);
          scan.retry.add(inboxEndpoint);
        }
        return;
      }
      scan.unresolved.add(object.url);
      return { error: new Error("Could not read object from storage bucket", { cause }), retryable: true };
    }
    this.firstMissingRead.delete(readKey);
    try {
      if ("a" in metadata && !recipient) throw new GraffitiErrorForbidden("An allowed ticket requires a recipient");
      await this.objectEncoding.validate(object, result.m.t, bytes,
        allowedTickets ? { allowedTickets }
          : "a" in metadata ? { recipient: recipient ?? "", allowedTicket: metadata.a, allowedIndex: metadata.i }
          : undefined,
        metadata[RECORD_KIND_KEY]);
    } catch (cause) {
      return { error: new Error("Invalid inbox object", { cause }), retryable: false };
    }
    if (!await this.verifiedMessages.remember({
      scope: recipient ?? null, inbox: inboxEndpoint, message: result, storageKey: storageBucketKey,
    }, state.generation)) {
      scan.unresolved.add(object.url);
      return { error: new Error("Object availability changed during validation"), retryable: true };
    }
    return resultBase;
  }

  private async storageEndpoint(actor: string): Promise<string> {
    const document = await this.dids.resolve(actor);
    const service = document.service?.find((service) =>
      service.id === DID_SERVICE_ID_GRAFFITI_STORAGE_BUCKET && service.type === DID_SERVICE_TYPE_GRAFFITI_STORAGE_BUCKET);
    if (typeof service?.serviceEndpoint !== "string") throw new Error(`Actor ${actor} has no valid storage bucket endpoint`);
    return service.serviceEndpoint;
  }

  private async *checkDeletionHints(scan: DiscoveryScan): AsyncGenerator<{ item: SingleEndpointQueryItem<{}>; origin: string }> {
    for (const [url, origins] of scan.hints) {
      const origin = origins.values().next().value;
      if (origin === undefined) continue;
      if (scan.incomplete || scan.unresolved.has(url)) {
        for (const endpoint of origins) scan.retry.add(endpoint);
        continue;
      }
      const verified = await this.verifiedMessages.list(url, scan.recipient);
      if (!verified.length) continue;
      try {
        let endpoint: Promise<string> | undefined;
        const keys = [...new Set(verified.map((entry) => entry.storageKey))];
        // Check every verified location, rather than trusting a key in the hint.
        // A rotation can remove one key while another remains available.
        const checks = await Promise.all(keys.map(async (key) => {
          if (verified.filter((entry) => entry.storageKey === key).every((entry) => entry.missing)) return true;
          try {
            endpoint ??= this.storageEndpoint(verified[0].message.m.o.actor);
            await this.storageBuckets.get(await endpoint, key, MAX_OBJECT_SIZE_BYTES);
            return false;
          }
          catch (error) {
            if (!(error instanceof GraffitiErrorNotFound)) throw error;
            await this.verifiedMessages.missing(url, key);
            return true;
          }
        }));
        if (!checks.every(Boolean)) continue;
        await this.inboxes.invalidateReads(url);
        const original = verified[0];
        const metadata = MessageMetadataSchema.parse(dagCborDecode(original.message.m.m));
        yield { origin, item: {
          object: original.message.m.o, messageId: original.message.id,
          storageBucketKey: original.storageKey, tags: original.message.m.t,
          allowedTickets: "s" in metadata ? metadata.s : undefined,
          announcements: "n" in metadata ? metadata.n : undefined,
          kind: metadata[RECORD_KIND_KEY], tombstone: true,
        } };
        if (scan.personal) {
          const personal = scan.personal;
          const ids = verified.filter((entry) => entry.inbox === personal.endpoint).map((entry) => entry.message.id);
          await this.inboxes.unpin(personal.endpoint, ids, personal.token);
          for (const id of ids) this.confirmedPins.delete(this.pinKey(personal.endpoint, personal.actor, id));
        }
      } catch (cause) {
        for (const endpoint of origins) scan.retry.add(endpoint);
        yield { origin, item: { error: new Error("Could not check deletion hint", { cause }), retryable: true } };
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
  protocol: literal(2),
  cursors: record(url(), string()),
  channels: array(string()),
  schema: union([looseObject({}), boolean()]),
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
> extends AsyncGenerator<SingleEndpointQueryItem<Schema>, string | undefined> {}
type IndexedSingleEndpointQueryResult<Schema extends JSONSchema> =
  | {
      index: number;
      error?: undefined;
      result: IteratorResult<SingleEndpointQueryItem<Schema>, string | undefined>;
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

interface DiscoveryScan {
  recipient: string | null;
  hints: Map<string, Set<string>>;
  unresolved: Set<string>;
  retry: Set<string>;
  incomplete?: boolean;
  personal?: { endpoint: string; token: string; actor: string };
}
function newScan(recipient?: string | null): DiscoveryScan {
  return { recipient: recipient ?? null, hints: new Map(), unresolved: new Set(), retry: new Set() };
}
interface ProtocolReadOptions extends InboxReadOptions {
  pin?: boolean;
  scan?: DiscoveryScan;
}
function sameMessage(a: InboxMessageBase, b: InboxMessageBase): boolean {
  const left = dagCborEncode(a.m);
  const right = dagCborEncode(b.m);
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}
