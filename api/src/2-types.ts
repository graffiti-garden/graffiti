import type { JSONSchema, FromSchema } from "json-schema-to-ts";

/**
 * Objects are the atomic unit in Graffiti that can represent both data (*e.g.* a social media post or profile)
 * and activities (*e.g.* a like or follow).
 *
 * Each object embeds the {@link actor | `actor`} that created it.
 * Object content and metadata are static but an object may be deleted by
 * its creating {@link actor | `actor`}.
 *
 * An object's content is stored in its {@link value | `value`} property, which can be any JSON
 * object. However, it is recommended to use properties from the
 * [Activity Vocabulary](https://www.w3.org/TR/activitystreams-vocabulary/)
 * or properties that emerge in the Graffiti [folksonomy](https://en.wikipedia.org/wiki/Folksonomy)
 * to promote interoperability.
 *
 * Each object is globally addressable via its {@link url | `url`}.
 *
 * An object's {@link channels | `channels`} and {@link allowed | `allowed`} properties
 * are set by an objects creator to shape the visibility of and access to their object.
 */
export interface GraffitiObjectBase {
  /**
   * The object's content as freeform JSON. We recommend using properties from the
   * [Activity Vocabulary](https://www.w3.org/TR/activitystreams-vocabulary/)
   * or properties that emerge in the Graffiti [folksonomy](https://en.wikipedia.org/wiki/Folksonomy)
   * to promote interoperability.
   */
  value: {};

  /**
   * An array of URIs the creator associates with the object. Objects can only be found by querying
   * one of the object's channels using the
   * {@link Graffiti.discover} method. This allows creators to express the intended audience of their object
   * which helps to prevent [context collapse](https://en.wikipedia.org/wiki/Context_collapse) even
   * in the highly interoperable ecosystem that Graffiti envisions. For example, channel URIs may be:
   * - A actor's own {@link actor | `actor`} URI. Posting an object to this channel is a way to broadcast
   * the object to the actor's followers, like posting a tweet.
   * - The URL of a Graffiti post. Posting an object to this channel is a way to broadcast to anyone viewing
   * the post, like commenting on a tweet.
   * - A URI representing a topic. Posting an object to this channel is a way to broadcast to anyone interested
   * in that topic, like posting in a subreddit.
   */
  channels: string[];

  /**
   * An optional array of {@link actor | `actor`} URIs that the creator allows to access the object.
   * If no `allowed` array is provided, the object can be accessed by anyone (so long as they
   * also know the right {@link channels | `channel` } to look in). An object can always be accessed by its creator, even if
   * the `allowed` array is empty.
   *
   * The `allowed` array is not revealed to actors other than the creator, like
   * a BCC email. An actor may choose to add a `to` property to the object's {@link value | `value`} to indicate
   * other recipients, however this is not enforced by Graffiti and may not accurately reflect the actual `allowed` array.
   *
   * `allowed` can be combined with {@link channels | `channels`}. For example, to send someone a direct message
   * the sender should post their object to the channel of the recipient's {@link actor | `actor`} URI to notify them of the message and also add
   * the recipient's {@link actor | `actor`} URI to the `allowed` array to prevent others from seeing the message.
   */
  allowed?: string[] | null;

  /**
   * The URI of the `actor` that {@link Graffiti.post | created } the object.
   * This `actor`  has the unique permission to
   * {@link Graffiti.delete | delete} the object.
   *
   * We borrow the term actor from the ActivityPub because
   * [like in ActivityPub](https://www.w3.org/TR/activitypub/#h-note-0)
   * there is not necessarily a one-to-one mapping between actors and people/users.
   * Multiple people can share the same actor or one person can have multiple actors.
   * Actors can also be bots.
   *
   * In Graffiti, actors are always globally unique URIs which
   * allows them to also function as {@link channels | `channels`}.
   */
  actor: string;

  /**
   * A globally unique identifier and locator for the object. It can be used to point to
   * an object or to retrieve the object directly with {@link Graffiti.get}.
   *
   * An object's URL is generated when the object is first created and
   * should include sufficient randomness to prevent collisions
   * and guessing. The URL starts with a "scheme," just like web URLs start with `http` or `https`, to indicate
   * to indicate the particular Graffiti implementation. This allows for applications
   * to pull from multiple coexisting Graffiti implementations without collision.
   * Existing schemes include `graffiti:local:` for objects stored locally
   * (see the [local implementation](https://github.com/graffiti-garden/implementation-local))
   * and `graffiti:remote:` for objects stored on Graffiti-specific web servers (see the [remote implementation](https://github.com/graffiti-garden/implementation-remote))
   * Options available in the future might include `graffiti:solid:` for objects stored on Solid servers
   * or `graffiti:p2p:` for objects stored on a peer-to-peer network.
   */
  url: string;
}

/**
 * This type constrains the {@link GraffitiObjectBase} type to adhere to a
 * particular [JSON schema](https://json-schema.org/).
 * This allows for static type-checking of an object's {@link GraffitiObjectBase.value | `value`}
 * which is otherwise a freeform JSON object.
 *
 * Schema-aware objects are returned by {@link Graffiti.get} and {@link Graffiti.discover}.
 */
export type GraffitiObject<Schema extends JSONSchema> = GraffitiObjectBase &
  FromSchema<Schema & typeof GraffitiPostObjectJSONSchema>;

/**
 * A JSON Schema equivalent to the {@link GraffitiObjectBase} type.
 * Needed internally for type inference of JSON Schemas, but can
 * be used by implementations to validate objects.
 */
export const GraffitiObjectJSONSchema = {
  type: "object",
  properties: {
    value: { type: "object" },
    channels: { type: "array", items: { type: "string" } },
    allowed: { type: "array", items: { type: "string" }, nullable: true },
    url: { type: "string" },
    actor: { type: "string" },
  },
  additionalProperties: false,
  required: ["value", "channels", "actor", "url"],
} as const satisfies JSONSchema;

/**
 * This is an object containing only the {@link GraffitiObjectBase.url | `url`}
 * property of a {@link GraffitiObjectBase | GraffitiObject}.
 * It is used as a utility type so that applications can call
 * {@link Graffiti.delete} directly on an object
 * rather than on `object.url`.
 */
export type GraffitiObjectUrl = Pick<GraffitiObjectBase, "url">;

/**
 * This object is a subset of {@link GraffitiObjectBase} that must be constructed locally before calling {@link Graffiti.post}.
 * This local copy ignores system-generated properties
 * ({@link GraffitiObjectBase.url | `url`} and {@link GraffitiObjectBase.actor | `actor`}),
 * and may be statically typed with
 * a [JSON schema](https://json-schema.org/) to prevent the accidental creation of erroneous objects.
 *
 * This local object must have a {@link GraffitiObjectBase.value | `value`} and {@link GraffitiObjectBase.channels | `channels`}
 * and may optionally have an {@link GraffitiObjectBase.allowed | `allowed`} property.
 */
export type GraffitiPostObject<Schema extends JSONSchema> = Pick<
  GraffitiObjectBase,
  "value" | "channels" | "allowed"
> &
  FromSchema<Schema & typeof GraffitiPostObjectJSONSchema>;

/**
 * A JSON Schema equivalent to the {@link GraffitiPostObject} type.
 * Needed internally for type inference of JSON Schemas, but can
 * be used by implementations to validate objects.
 */
export const GraffitiPostObjectJSONSchema = {
  ...GraffitiObjectJSONSchema,
  required: ["value", "channels"],
} as const satisfies JSONSchema;

/**
 * This object contains information that the underlying implementation can
 * use to authenticate a particular {@link GraffitiObjectBase.actor | `actor`}.
 * This object is required of all {@link Graffiti} methods
 * that modify objects or media and is optional for methods that read objects.
 *
 * At a minimum the `session` object must contain the
 * {@link GraffitiSession.actor | `actor`} URI to authenticate with.
 * However it is likely that the `session` object must contain other
 * implementation-specific properties.
 * For example, a Solid implementation might include a
 * [`fetch`](https://docs.inrupt.com/developer-tools/api/javascript/solid-client-authn-browser/functions.html#fetch)
 * function. A distributed implementation may include
 * a cryptographic signature.
 *
 * As to why the `session` object is passed as an argument to every method
 * rather than being an internal property of the {@link Graffiti} instance,
 * this is primarily for type-checking to catch bugs related to login state.
 * Graffiti applications can expose some functionality to people who are not logged in
 * with {@link Graffiti.get} and {@link Graffiti.discover} but without type-checking
 * the `session` it can be easy to forget to hide buttons that trigger
 * other methods that require login.
 *
 * Passing the `session` object per-method also allows for multiple sessions
 * to be used within the same application, like an Email client fetching from
 * multiple accounts.
 */
export interface GraffitiSession {
  /**
   * The {@link GraffitiObjectBase.actor | `actor`} to authenticate with.
   */
  actor: string;
}

/**
 * A stream of data that are returned by {@link Graffiti.discover}.
 *
 * Errors are returned within the stream rather than as
 * exceptions that would halt the entire stream. This is because
 * some implementations may pull data from multiple sources
 * including some that may be unreliable. In many cases,
 * these errors can be safely ignored.
 * See {@link GraffitiObjectStreamError}.
 *
 * The stream is an [`AsyncGenerator`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function)
 * that can be iterated over using `for await` loops or calling `next` on the generator.
 * The stream can be terminated by breaking out of a loop calling `return` on the generator.
 *
 * The stream ends by returning a {@link GraffitiObjectStreamReturn.continue | `continue`}
 * function and a {@link GraffitiObjectStreamReturn.cursor | `cursor`} string,
 * each of which can be used to resume the stream from where it left off.
 */
export type GraffitiObjectStream<Schema extends JSONSchema> = AsyncGenerator<
  GraffitiObjectStreamError | GraffitiObjectStreamEntry<Schema>,
  GraffitiObjectStreamReturn<Schema>
>;

/**
 * An error that can occur in a {@link GraffitiObjectStream}.
 *
 * @internal
 */
export interface GraffitiObjectStreamError {
  /**
   * The error that occurred while streaming data.
   */
  error: Error;
  /**
   * The origin that the error occurred. It will include
   * the scheme of the Graffiti implementation used and other
   * implementation-specific information like a hostname.
   */
  origin: string;
}

/**
 * A successful result from a {@link GraffitiObjectStream} or
 * {@link GraffitiObjectStreamContinue} that includes an object.
 *
 * @internal
 */
export interface GraffitiObjectStreamEntry<Schema extends JSONSchema> {
  /**
   * Empty property for compatibility with {@link GraffitiObjectStreamError}
   */
  error?: undefined;
  /**
   * Empty property for compatibility with {@link GraffitiObjectStreamContinueTombstone}
   */
  tombstone?: undefined;
  /**
   * The object returned by the stream.
   */
  object: GraffitiObject<Schema>;
}

/**
 * A result from a {@link GraffitiObjectStreamContinue} that indicated
 * an object has been deleted since the original stream was run.
 * Only sparse metadata about the deleted object is returned to respect
 * the deleting actor's privacy.
 *
 * @internal
 */
export interface GraffitiObjectStreamContinueTombstone {
  /**
   * Empty property for compatibility with {@link GraffitiObjectStreamError}
   */
  error?: undefined;
  /**
   * Use this property to differentiate a tombstone from a
   * {@link GraffitiObjectStreamEntry}.
   */
  tombstone: true;
  /**
   * Sparse metadata about the deleted object. The full object is not returned
   * to respect an actor's privacy.
   */
  object: {
    /**
     * The {@link GraffitiObjectBase.url | `url`} of the deleted object.
     */
    url: string;
  };
}

/**
 * A continuation of the {@link GraffitiObjectStream} type can include
 * both objects and tombstones of deleted objects.
 *
 * @internal
 */
export type GraffitiObjectStreamContinueEntry<Schema extends JSONSchema> =
  | GraffitiObjectStreamEntry<Schema>
  | GraffitiObjectStreamContinueTombstone;

/**
 * The output of a {@link GraffitiObjectStream} or a {@link GraffitiObjectStreamContinue}
 * that allows the stream to be continued from where it left off.
 *
 * The {@link continue} function preserves the typing of the original stream,
 * where as the {@link cursor} string can be serialized for use after a person
 * has closed and reopened an application.
 *
 * The continued stream may include `tombstone`s of objects that have been
 * deleted since the original stream was run. See {@link GraffitiObjectStreamContinueTombstone}.
 * The continued stream may also return some objects that were already
 * returned by the original stream, depending on how much state the
 * underlying implementation is able to preserve.
 *
 * @internal
 */
export interface GraffitiObjectStreamReturn<Schema extends JSONSchema> {
  /**
   * @returns A function that creates new stream that continues from where the original stream left off.
   * It preserves the typing of the original stream.
   */
  continue: (
    session?: GraffitiSession | null,
  ) => GraffitiObjectStreamContinue<Schema>;
  /**
   * A string that can be serialized and stored to resume the stream later.
   * It must be passed to the {@link Graffiti.continueDiscover} method
   * to resume the stream.
   */
  cursor: string;
}

/**
 * A continutation of the {@link GraffitiObjectStream} type, as returned by
 * the {@link GraffitiObjectStreamReturn.continue} or by using
 * {@link GraffitiObjectStreamReturn.cursor} with {@link Graffiti.continueDiscover}.
 *
 * The continued stream may include `tombstone`s of objects that have been
 * deleted since the original stream was run. See {@link GraffitiObjectStreamContinueTombstone}.
 *
 * @internal
 */
export type GraffitiObjectStreamContinue<Schema extends JSONSchema> =
  AsyncGenerator<
    GraffitiObjectStreamError | GraffitiObjectStreamContinueEntry<Schema>,
    GraffitiObjectStreamReturn<Schema>
  >;

/**
 * The event type produced in {@link Graffiti.sessionEvents}
 * when a actor logs in manually from {@link Graffiti.login}
 * or when their session is restored from a previous login.
 * The event name to listen for is `login`.
 */
export type GraffitiLoginEvent = CustomEvent<
  | {
      error: Error;
      session?: GraffitiSession;
    }
  | {
      error?: undefined;
      session: GraffitiSession;
    }
>;

/**
 * The event type produced in {@link Graffiti.sessionEvents}
 * when a actor logs out either manually with {@link Graffiti.logout}
 * or when their session times out or otherwise becomes invalid.
 * The event name to listen for is `logout`.
 */
export type GraffitiLogoutEvent = CustomEvent<
  | {
      error: Error;
      actor?: string;
    }
  | {
      error?: undefined;
      actor: string;
    }
>;

/**
 * The event type produced in {@link Graffiti.sessionEvents}
 * after an application has attempted to complete any login redirects
 * and restore any previously active sessions.
 * Successful session restores will be returned in parallel as
 * their own {@link GraffitiLoginEvent} events.
 *
 * This event optionally returns an `href` property
 * representing the URL that originated a login request,
 * which may be useful for redirecting the user back to
 * the page they were on after login.
 * The event name to listen for is `initialized`.
 */
export type GraffitiSessionInitializedEvent = CustomEvent<
  | {
      error?: Error;
      href?: string;
    }
  | null
  | undefined
>;

export type GraffitiMedia = {
  /**
   * The binary data of the media to be uploaded,
   * along with its [media type](https://www.iana.org/assignments/media-types/media-types.xhtml),
   * formatted as a [Blob](https://developer.mozilla.org/en-US/docs/Web/API/Blob).
   */
  data: Blob;
  /**
   * The {@link GraffitiObjectBase.actor | `actor`} that
   * {@link Graffiti.postMedia | `post`ed} the media.
   */
  actor: string;
  /**
   * An optional list, identical in function to an object's
   * {@link GraffitiObjectBase.allowed | `allowed`} property,
   * that specifies the {@link GraffitiObjectBase.actor | `actor`}s
   * who are allowed to access the media. If the list is `undefined`
   * or `null`, anyone with the URL can access the media. If the list
   * is empty, only the {@link GraffitiObjectBase.actor | `actor`}
   * who {@link Graffiti.postMedia | `post`ed} the media can access it.
   */
  allowed?: string[] | null;
};

export type GraffitiPostMedia = Pick<GraffitiMedia, "data" | "allowed">;

export type GraffitiMediaAccept = {
  /**
   * A list of acceptable media types for the retrieved media.
   * Each type in the list may be of the form `<type>/<subtype>`,
   * `<type>/*`, or `&#42;/*`, just as types are formatted in
   * an [HTTP Accept header](https://httpwg.org/specs/rfc9110.html#field.accept).
   */
  types?: string[];
  /**
   * The maximum acceptable size, in bytes, of the media.
   */
  maxBytes?: number;
};
