import type { JSONSchema, FromSchema } from "json-schema-to-ts";
import type { Operation as JSONPatchOperation } from "fast-json-patch";

/**
 * Objects are the atomic unit in Graffiti that can represent both data (*e.g.* a social media post or profile)
 * and activities (*e.g.* a like or follow).
 * Objects are created and modified by a single {@link actor | `actor`}.
 *
 * Most of an object's content is stored in its {@link value | `value`} property, which can be any JSON
 * object. However, we recommend using properties from the
 * [Activity Vocabulary](https://www.w3.org/TR/activitystreams-vocabulary/)
 * or properties that emerge in the Graffiti [folksonomy](https://en.wikipedia.org/wiki/Folksonomy)
 * to promote interoperability.
 *
 * The object is globally addressable via its {@link url | `url`}.
 *
 * The {@link channels | `channels`} and {@link allowed | `allowed`} properties
 * enable the object's creator to shape the visibility of and access to their object.
 *
 * The {@link lastModified | `lastModified`} property can be used to compare object versions.
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
   * - A user's own {@link actor | `actor`} URI. Putting an object in this channel is a way to broadcast
   * the object to the user's followers, like posting a tweet.
   * - The URL of a Graffiti post. Putting an object in this channel is a way to broadcast to anyone viewing
   * the post, like commenting on a tweet.
   * - A URI representing a topic. Putting an object in this channel is a way to broadcast to anyone interested
   * in that topic, like posting in a subreddit.
   */
  channels: string[];

  /**
   * An optional array of {@link actor | `actor`} URIs that the creator allows to access the object.
   * If no `allowed` array is provided, the object can be accessed by anyone (so long as they
   * also know the right {@link channels | `channel` } to look in). An object can always be accessed by its creator, even if
   * the `allowed` array is empty.
   *
   * The `allowed` array is not revealed to users other than the creator, like
   * a BCC email. A user may choose to add a `to` property to the object's {@link value | `value`} to indicate
   * other recipients, however this is not enforced by Graffiti and may not accurately reflect the actual `allowed` array.
   *
   * `allowed` can be combined with {@link channels | `channels`}. For example, to send someone a direct message
   * the sender should put their object in the channel of the recipient's {@link actor | `actor`} URI to notify them of the message and also add
   * the recipient's {@link actor | `actor`} URI to the `allowed` array to prevent others from seeing the message.
   */
  allowed?: string[] | null;

  /**
   * The URI of the `actor` that {@link Graffiti.put | created } the object. This `actor` also has the unique permission to
   * {@link Graffiti.patch | modify} or {@link Graffiti.delete | delete} the object.
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
   * If an object is {@link Graffiti.put | put} with the same URL
   * as an existing object, the existing object will be replaced with the new object.
   *
   * An object's URL is generated when the object is first created and
   * should include sufficient randomness to prevent collisions
   * and guessing. The URL starts with a "scheme," just like web URLs start with `http` or `https`, to indicate
   * to indicate the particular Graffiti implementation. This allows for applications
   * to pull from multiple coexisting Graffiti implementations without collision.
   * Existing schemes include `graffiti:local:` for objects stored locally
   * (see the local implementation)
   * and `graffiti:remote:` for objects stored on Graffiti-specific web servers (see the remote implementation).
   * Options available in the future might include `graffiti:solid:` for objects stored on Solid servers
   * or `graffiti:p2p:` for objects stored on a peer-to-peer network.
   */
  url: string;

  /**
   * The time the object was last modified, measured in milliseconds since January 1, 1970.
   * It can be used to compare object versions.
   * A number, rather than an ISO string or Date object, is used for easy comparison, sorting,
   * and JSON Schema [range queries](https://json-schema.org/understanding-json-schema/reference/numeric#range).
   *
   * It is possible to use this value to sort objects in a user's interface but in many cases it would be better to
   * use a [`published`](https://www.w3.org/TR/activitystreams-vocabulary/#dfn-published)
   * property in the object's {@link value | `value`} to indicate when the object was created
   * rather than when it was modified.
   */
  lastModified: number;
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
  FromSchema<Schema & typeof GraffitiObjectJSONSchema>;

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
    lastModified: { type: "number" },
  },
  additionalProperties: false,
  required: ["value", "channels", "actor", "url", "lastModified"],
} as const satisfies JSONSchema;

/**
 * This is an object containing only the {@link GraffitiObjectBase.url | `url`}
 * property of a {@link GraffitiObjectBase | GraffitiObject}.
 * It is used as a utility type so that users can call {@link Graffiti.get},
 * {@link Graffiti.patch}, or {@link Graffiti.delete} directly on an object
 * rather than on `object.url`.
 */
export type GraffitiObjectUrl = Pick<GraffitiObjectBase, "url">;

/**
 * This object is a subset of {@link GraffitiObjectBase} that a user must construct locally before calling {@link Graffiti.put}.
 * This local copy does not require system-generated properties and may be statically typed with
 * a [JSON schema](https://json-schema.org/) to prevent the accidental creation of erroneous objects.
 *
 * This local object must have a {@link GraffitiObjectBase.value | `value`} and {@link GraffitiObjectBase.channels | `channels`}
 * and may optionally have an {@link GraffitiObjectBase.allowed | `allowed`} property.
 *
 * It may also include a {@link GraffitiObjectBase.url | `url`} property to specify the
 * URL of an existing object to replace. If no `url` is provided, one will be generated during object creation.
 *
 * This object does not need a {@link GraffitiObjectBase.lastModified | `lastModified`}
 * property since it will be automatically generated by the Graffiti system.
 */
export type GraffitiPutObject<Schema extends JSONSchema> = Pick<
  GraffitiObjectBase,
  "value" | "channels" | "allowed"
> &
  Partial<GraffitiObjectBase> &
  FromSchema<Schema & typeof GraffitiPutObjectJSONSchema>;

/**
 * A JSON Schema equivalent to the {@link GraffitiPutObject} type.
 * Needed internally for type inference of JSON Schemas, but can
 * be used by implementations to validate objects.
 */
export const GraffitiPutObjectJSONSchema = {
  ...GraffitiObjectJSONSchema,
  required: ["value", "channels"],
} as const satisfies JSONSchema;

/**
 * This object contains information that the underlying implementation can
 * use to verify that a user has permission to operate a
 * particular {@link GraffitiObjectBase.actor | `actor`}.
 * This object is required of all {@link Graffiti} methods
 * that modify objects and is optional for methods that read objects.
 *
 * At a minimum the `session` object must contain the
 * {@link GraffitiSession.actor | `actor`} URI the user wants to authenticate with.
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
 * Graffiti applications can expose some functionality to users who are not logged in
 * with {@link Graffiti.get} and {@link Graffiti.discover} but without type-checking
 * the `session` it can be easy to forget to hide buttons that trigger
 * other methods that require login.
 * In the future, `session` object may be updated to include scope information
 * and passing the `session` to each method can type-check whether the session provides the
 * necessary permissions.
 *
 * Passing the `session` object per-method also allows for multiple sessions
 * to be used within the same application, like an Email client fetching from
 * multiple accounts.
 */
export interface GraffitiSession {
  /**
   * The {@link GraffitiObjectBase.actor | `actor`} a user wants to authenticate with.
   */
  actor: string;
  /**
   * A yet undefined property detailing what operations the session
   * grants the user to perform. For example, to allow a user to
   * read private messages from a particular set of channels or
   * to allow the user to write object matching a particular schema.
   */
  scope?: {};
}

/**
 * This is the format for patches that modify {@link GraffitiObjectBase} objects
 * using the {@link Graffiti.patch} method. The patches must
 * be an array of [JSON Patch](https://jsonpatch.com) operations.
 * Patches can only be applied to the
 * {@link GraffitiObjectBase.value | `value`}, {@link GraffitiObjectBase.channels | `channels`},
 * and {@link GraffitiObjectBase.allowed | `allowed`} properties since the other
 * properties either describe the object's location or are automatically generated.
 * (See also {@link GraffitiPutObject}).
 */
export interface GraffitiPatch {
  /**
   * An array of [JSON Patch](https://jsonpatch.com) operations to
   * modify the object's {@link GraffitiObjectBase.value | `value`}. The resulting
   * `value` must still be a JSON object.
   */
  value?: JSONPatchOperation[];

  /**
   * An array of [JSON Patch](https://jsonpatch.com) operations to
   * modify the object's {@link GraffitiObjectBase.channels | `channels`}. The resulting
   * `channels` must still be an array of strings.
   */
  channels?: JSONPatchOperation[];

  /**
   * An array of [JSON Patch](https://jsonpatch.com) operations to
   * modify the object's {@link GraffitiObjectBase.allowed | `allowed`} property. The resulting
   * `allowed` property must still be an array of strings or `undefined`.
   */
  allowed?: JSONPatchOperation[];
}

/**
 * A stream of data that are returned by Graffiti's query-like operations
 * {@link Graffiti.discover} and {@link Graffiti.recoverOrphans}.
 *
 * Errors are returned within the stream rather than as
 * exceptions that would halt the entire stream. This is because
 * some implementations may pull data from multiple sources
 * including some that may be unreliable. In many cases,
 * these errors can be safely ignored.
 * See {@link GraffitiStreamError}.
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
  GraffitiStreamError | GraffitiObjectStreamEntry<Schema>,
  GraffitiObjectStreamReturn<Schema>
>;

/**
 * An error that can occur in either the
 * {@link GraffitiObjectStream} or {@link GraffitiChannelStatsStream}.
 *
 * @internal
 */
export interface GraffitiStreamError {
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
   * Empty property for compatibility with {@link GraffitiStreamError}
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
 * the deleting user's privacy.
 *
 * @internal
 */
export interface GraffitiObjectStreamContinueTombstone {
  /**
   * Empty property for compatibility with {@link GraffitiStreamError}
   */
  error?: undefined;
  /**
   * Use this property to differentiate a tombstone from a
   * {@link GraffitiObjectStreamEntry}.
   */
  tombstone: true;
  /**
   * Sparse metadata about the deleted object. The full object is not returned
   * to respect a user's privacy.
   */
  object: {
    /**
     * The {@link GraffitiObjectBase.url | `url`} of the deleted object.
     */
    url: string;
    /**
     * The time at which the object was deleted, comparable to
     * {@link GraffitiObjectBase.lastModified | `lastModified`}.
     *
     * While it is not possible to re-{@link Graffiti.put | put} objects that have been
     * {@link Graffiti.delete | deleted}, objects may appear deleted if
     * an {@link GraffitiObjectBase.actor | `actor`} is no longer
     * {@link GraffitiObjectBase.allowed | `allowed`} to access them.
     * Therefore the {@link GraffitiObjectBase.lastModified | `lastModified`} property
     * is necessary to compare object versions.
     */
    lastModified: number;
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
 * where as the {@link cursor} string can be serialized for use after a user
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
  continue: () => GraffitiObjectStreamContinue<Schema>;
  /**
   * A string that can be serialized and stored to resume the stream later.
   * It must be passed to the {@link Graffiti.continueObjectStream} method
   * to resume the stream.
   */
  cursor: string;
}

/**
 * A continutation of the {@link GraffitiObjectStream} type, as returned by
 * the {@link GraffitiObjectStreamReturn.continue} or by using
 * {@link GraffitiObjectStreamReturn.cursor} with {@link Graffiti.continueObjectStream}.
 *
 * The continued stream may include `tombstone`s of objects that have been
 * deleted since the original stream was run. See {@link GraffitiObjectStreamContinueTombstone}.
 *
 * @internal
 */
export type GraffitiObjectStreamContinue<Schema extends JSONSchema> =
  AsyncGenerator<
    GraffitiStreamError | GraffitiObjectStreamContinueEntry<Schema>,
    GraffitiObjectStreamReturn<Schema>
  >;

/**
 * Statistic about single channel returned by {@link Graffiti.channelStats}.
 * These statistics only account for contributions made by the
 * querying actor.
 */
export type ChannelStats = {
  /**
   * The URI of the channel.
   */
  channel: string;
  /**
   * The number of objects that the actor has {@link Graffiti.put | put}
   * and not {@link Graffiti.delete | deleted} in the channel.
   */
  count: number;
  /**
   * The time that the actor {@link GraffitiObjectBase.lastModified | last modified} an object in the channel,
   * measured in milliseconds since January 1, 1970.
   * {@link Graffiti.delete | Deleted} objects do not effect this modification time.
   */
  lastModified: number;
};

/**
 * A stream of data that are returned by Graffiti's {@link Graffiti.channelStats} method.
 * See {@link GraffitiObjectStream} for more information on streams.
 */
export type GraffitiChannelStatsStream = AsyncGenerator<
  | GraffitiStreamError
  | {
      error?: undefined;
      value: ChannelStats;
    }
>;

/**
 * The event type produced in {@link Graffiti.sessionEvents}
 * when a user logs in manually from {@link Graffiti.login}
 * or when their session is restored from a previous login.
 * The event name to listen for is `login`.
 */
export type GraffitiLoginEvent = CustomEvent<
  | {
      error: Error;
      session?: undefined;
    }
  | {
      error?: undefined;
      session: GraffitiSession;
    }
>;

/**
 * The event type produced in {@link Graffiti.sessionEvents}
 * when a user logs out either manually with {@link Graffiti.logout}
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
 * representing the URL the user originated a login request
 * from, which may be useful for redirecting the user back to
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
