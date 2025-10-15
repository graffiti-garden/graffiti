import type {
  GraffitiObjectUrl,
  GraffitiObject,
  GraffitiObjectBase,
  GraffitiPatch,
  GraffitiSession,
  GraffitiPutObject,
  GraffitiObjectStream,
  ChannelStats,
  GraffitiChannelStatsStream,
  GraffitiObjectStreamContinue,
} from "./2-types";
import type { JSONSchema } from "json-schema-to-ts";

/**
 * This API describes a small but powerful set of methods that
 * can be used to create many different kinds of social applications,
 * from applications like Twitter, to Messenger, to Wikipedia, to many more new designs.
 * See the [Graffiti project website](https://graffiti.garden)
 * for links to example applications. Additionally, apps built on top
 * of the API interoperate with each other so you can seamlessly switch
 * between apps without losing your friends or data.
 *
 * These API methods should satisfy all of an application's needs for
 * the communication, storage, and access management of social data.
 * The rest of the application can be built with standard client-side
 * user interface tools to present and interact with that data—no server code necessary!
 *
 * The Typescript code for this API is [open source on Github](https://github.com/graffiti-garden/api).
 *
 * There are several different implementations of this Graffiti API available,
 * including a [federated implementation](https://github.com/graffiti-garden/implementation-remote),
 * that lets people choose where their data is stored (you do not need to host your own server)
 * and a [local implementation](https://github.com/graffiti-garden/implementation-local)
 * that can be used for testing and development. Different implementations can
 * be swapped-in in the future without changing the API or any of the apps built on
 * top of it. In fact, we're working on an end-to-end encrypted version now!
 * [Follow Theia on BlueSky for updates](https://bsky.app/profile/theias.place).
 *
 * On the other side of the stack, there is [Vue plugin](https://vue.graffiti.garden/variables/GraffitiPlugin.html)
 * that wraps around this API to provide reactivity. Other plugin frameworks
 * and high-level libraries will be available in the future.
 *
 * ## API Overview
 *
 * The Graffiti API provides applications with methods for {@link login} and {@link logout},
 * methods to store data objects using standard database operations ({@link put}, {@link get}, {@link patch}, and {@link delete}),
 * and a method to {@link discover} data objects from other people.
 * These data objects have a couple structured properties:
 * - {@link GraffitiObjectBase.url | `url`} (string): A globally unique identifier and locator for the object.
 * - {@link GraffitiObjectBase.actor | `actor`} (string): An unforgeable identifier for the creator of the object.
 * - {@link GraffitiObjectBase.allowed | `allowed`} (string[] | undefined): An array of the identities who are allowed to access the object (undefined for public objects).
 * - {@link GraffitiObjectBase.channels | `channels`} (string[]): An array of the *contexts* in which the object should appear.
 * - {@link GraffitiObjectBase.lastModified | `revision`} (number): A number to compare different versions of an object.
 *
 * All other data is stored in the object's unstructured {@link GraffitiObjectBase.value | `value`} property.
 * This data can be used to represent social artifacts (e.g. posts, profiles) and activities (e.g. likes, follows).
 * For example, a post might have the value:

 * ```js
 * {
 *   title: "My First Post",
 *   content: "Hello, world!",
 *   published: 1630483200000
 * }
 * ```
 *
 * a profile might have the value:
 *
 * ```js
 * {
 *   name: "Theia Henderson",
 *   pronouns: "she/her",
 *   describes: "did:web:theias.place" // Theia's actor ID
 * }
 * ```
 *
 * and a "Like" might have the value:
 *
 * ```js
 * {
 *   activity: "Like",
 *   target: "graffiti:remote:pod.graffiti.garden/12345" // The URL of the graffiti object being liked
 * }
 * ```
 *
 * New social artifacts and activities can be easily created, simply
 * by creating new objects with appropriate properties. Despite the lack of
 * structure, we expect Graffiti object properties to adhere to a "[folksonomy](https://en.wikipedia.org/wiki/Folksonomy)",
 * similar to hashtags. Any string can be used as a hashtag on Twitter,
 * but there is social value in using the same hashtags at other people and
 * so a structure naturally emerges. Similarly, Graffiti objects
 * can have arbitrary properties but if people use the same properties as each other,
 * their apps will interoperate, which has social value.
 *
 * For a more complete and detailed overview of Graffiti's design, please
 * refer to [this section of the Graffiti paper](https://dl.acm.org/doi/10.1145/3746059.3747627#sec-3),
 * published in ACM UIST 2025. The paper also overviews {@link GraffitiObjectBase.channels | `channels`},
 * which are Graffiti's means of organizing data contextually, and a concept called "total reification",
 * which handles explains how moderation, collaboration, and other interactions are managed.
 *
 * @groupDescription CRUD Methods
 * Methods for {@link put | creating}, {@link get | reading}, {@link patch | updating},
 * and {@link delete | deleting} {@link GraffitiObjectBase | Graffiti objects}.
 * @groupDescription Query Methods
 * Methods that retrieve or accumulate information about multiple {@link GraffitiObjectBase | Graffiti objects} at a time.
 * @groupDescription Session Management
 * Methods and properties for logging in and out.
 */
export abstract class Graffiti {
  /**
   * Creates a new {@link GraffitiObjectBase | object} or replaces an existing object.
   * An object can only be replaced by the same {@link GraffitiObjectBase.actor | `actor`}
   * that created it.
   *
   * Replacement occurs when the {@link GraffitiObjectBase.url | `url`} of
   * the replaced object exactly matches an existing object's URL.
   *
   * @throws {@link GraffitiErrorNotFound} if a {@link GraffitiObjectBase.url | `url`}
   * is provided that has not been created yet or the {@link GraffitiObjectBase.actor | `actor`}
   * is not {@link GraffitiObjectBase.allowed | `allowed`} to see it.
   *
   * @throws {@link GraffitiErrorForbidden} if the {@link GraffitiObjectBase.actor | `actor`}
   * is not the same `actor` as the one who created the object.
   *
   * @returns Returns the object that was replaced if one one exists, otherwise returns an object with
   * with an empty {@link GraffitiObjectBase.value | `value`},
   * {@link GraffitiObjectBase.channels | `channels`}, and {@link GraffitiObjectBase.allowed | `allowed`}
   * list.
   * The {@link GraffitiObjectBase.lastModified | `lastModified`} property of the returned object
   * will be updated to the time of replacement/creation.
   *
   * @group CRUD Methods
   */
  abstract put<Schema extends JSONSchema>(
    /**
     * The object to be put. This object is statically type-checked against the [JSON schema](https://json-schema.org/) that can be optionally provided
     * as the generic type parameter. We highly recommend providing a schema to
     * ensure that the put object matches subsequent {@link get} or {@link discover}
     * methods.
     */
    object: GraffitiPutObject<Schema>,
    /**
     * An implementation-specific object with information to authenticate the
     * {@link GraffitiObjectBase.actor | `actor`}.
     */
    session: GraffitiSession,
  ): Promise<GraffitiObjectBase>;

  /**
   * Retrieves an object from a given {@link GraffitiObjectBase.url | `url`}.
   *
   * The retrieved object is type-checked against the provided [JSON schema](https://json-schema.org/)
   * otherwise a {@link GraffitiErrorSchemaMismatch} is thrown.
   *
   * If the retreiving {@link GraffitiObjectBase.actor | `actor`} is not
   * the object's `actor`,
   * the object's {@link GraffitiObjectBase.allowed | `allowed`} and
   * {@link GraffitiObjectBase.channels | `channels`} properties are
   * not revealed, similar to a BCC email.
   *
   * @returns Returns the retrieved object.
   *
   * @throws {@link GraffitiErrorNotFound} if the object does not exist, has been deleted, or the actor is not
   * {@link GraffitiObjectBase.allowed | `allowed`} to access it.
   *
   * @throws {@link GraffitiErrorSchemaMismatch} if the retrieved object does not match the provided schema.
   *
   * @group CRUD Methods
   */
  abstract get<Schema extends JSONSchema>(
    /**
     * The location of the object to get.
     */
    url: string | GraffitiObjectUrl,
    /**
     * The JSON schema to validate the retrieved object against.
     */
    schema: Schema,
    /**
     * An implementation-specific object with information to authenticate the
     * {@link GraffitiObjectBase.actor | `actor`}. If no `session` is provided,
     * the retrieved object's {@link GraffitiObjectBase.allowed | `allowed`}
     * property must be `undefined`.
     */
    session?: GraffitiSession | null,
  ): Promise<GraffitiObject<Schema>>;

  /**
   * Patches an existing object at a given {@link GraffitiObjectBase.url | `url`}.
   * The patching {@link GraffitiObjectBase.actor | `actor`} must be the same as the
   * `actor` that created the object.
   *
   * @returns Returns the original object prior to the patch with its
   * {@link GraffitiObjectBase.lastModified | `lastModified`}
   * property updated to the time of patching.
   *
   * @throws {@link GraffitiErrorNotFound} if the object does not exist, has already been deleted,
   * or the actor is not {@link GraffitiObjectBase.allowed | `allowed`} to access it.
   *
   * @throws {@link GraffitiErrorForbidden} if the {@link GraffitiObjectBase.actor | `actor`}
   * is not the same `actor` as the one who created the object.
   *
   * @group CRUD Methods
   */
  abstract patch(
    /**
     * A collection of [JSON Patch](https://jsonpatch.com) operations
     * to apply to the object. See {@link GraffitiPatch} for more information.
     */
    patch: GraffitiPatch,
    /**
     * The location of the object to patch.
     */
    url: string | GraffitiObjectUrl,
    /**
     * An implementation-specific object with information to authenticate the
     * {@link GraffitiObjectBase.actor | `actor`}.
     */
    session: GraffitiSession,
  ): Promise<GraffitiObjectBase>;

  /**
   * Deletes an object from a given {@link GraffitiObjectBase.url | `url`}.
   * The deleting {@link GraffitiObjectBase.actor | `actor`} must be the same as the
   * `actor` that created the object.
   *
   * It is not possible to re-{@link put} an object that has been deleted
   * to ensure a person's [right to be forgotten](https://en.wikipedia.org/wiki/Right_to_be_forgotten).
   * In cases where deleting and restoring an object is useful, an object's
   * {@link GraffitiObjectBase.allowed | `allowed`} property can be set to
   * an empty list to hide it from all actors except the creator.
   *
   * @returns Returns the object that was deleted with its
   * {@link GraffitiObjectBase.lastModified | `lastModified`}
   * property updated to the time of deletion.
   *
   * @throws {@link GraffitiErrorNotFound} if the object does not exist,  has already been deleted,
   * or the actor is not {@link GraffitiObjectBase.allowed | `allowed`} to access it.
   *
   * @throws {@link GraffitiErrorForbidden} if the {@link GraffitiObjectBase.actor | `actor`}
   * is not the same `actor` as the one who created the object.
   *
   * @group CRUD Methods
   */
  abstract delete(
    /**
     * The location of the object to delete.
     */
    url: string | GraffitiObjectUrl,
    /**
     * An implementation-specific object with information to authenticate the
     * {@link GraffitiObjectBase.actor | `actor`}.
     */
    session: GraffitiSession,
  ): Promise<GraffitiObjectBase>;

  /**
   * Discovers objects created by any actor that are contained
   * in at least one of the given {@link GraffitiObjectBase.channels | `channels`}
   * and match the given [JSON Schema](https://json-schema.org).
   *
   * Objects are returned asynchronously as they are discovered but the stream
   * will end once all leads have been exhausted.
   * The {@link GraffitiObjectStream} ends by returning a
   * {@link GraffitiObjectStreamReturn.continue | `continue`} method and a
   * {@link GraffitiObjectStreamReturn.cursor | `cursor`} string,
   * each of which can be be used to poll for new objects.
   * The `continue` method preserves the type safety of the stream and the `cursor`
   * string can be serialized to continue the stream after an application is closed
   * and reopened.
   *
   * `discover` will not return objects that the {@link GraffitiObjectBase.actor | `actor`}
   * is not {@link GraffitiObjectBase.allowed | `allowed`} to access.
   * If the `actor` is not the creator of a discovered object,
   * the allowed list will be masked to only contain the querying actor if the
   * allowed list is not `undefined` (public). Additionally, if the actor is not the
   * creator of a discovered object, any {@link GraffitiObjectBase.channels | `channels`}
   * not specified by the `discover` method will not be revealed. This masking happens
   * before the object is validated against the supplied `schema`.
   *
   * Since different implementations may fetch data from multiple sources there is
   * no guarentee on the order that objects are returned in.
   * It is also possible that duplicate objects are returned and their
   * {@link GraffitiObjectBase.lastModified | `lastModified`} fields must be used
   * to determine which object is the most recent.
   *
   * @returns Returns a stream of objects that match the given {@link GraffitiObjectBase.channels | `channels`}
   * and [JSON Schema](https://json-schema.org).
   *
   * @group Query Methods
   */
  abstract discover<Schema extends JSONSchema>(
    /**
     * The {@link GraffitiObjectBase.channels | `channels`} that objects must be associated with.
     */
    channels: string[],
    /**
     * A [JSON Schema](https://json-schema.org) that objects must satisfy.
     */
    schema: Schema,
    /**
     * An implementation-specific object with information to authenticate the
     * {@link GraffitiObjectBase.actor | `actor`}. If no `session` is provided,
     * only objects that have no {@link GraffitiObjectBase.allowed | `allowed`}
     * property will be returned.
     */
    session?: GraffitiSession | null,
  ): GraffitiObjectStream<Schema>;

  /**
   * Discovers objects **not** contained in any
   * {@link GraffitiObjectBase.channels | `channels`}
   * that were created by the querying {@link GraffitiObjectBase.actor | `actor`}
   * and match the given [JSON Schema](https://json-schema.org).
   * Unlike {@link discover}, this method will not return objects created by other actors.
   *
   * Like {@link channelStats}, this method is not useful for most applications,
   * but necessary for getting a global view of all an actor's Graffiti data
   * to implement something like Facebook's Activity Log or a debugging interface.
   *
   * Like {@link discover}, objects are returned asynchronously as they are discovered,
   * the stream will end once all leads have been exhausted, and the stream
   * can be continued using the {@link GraffitiObjectStreamReturn.continue | `continue`}
   * method or {@link GraffitiObjectStreamReturn.cursor | `cursor`} string.
   *
   * @returns Returns a stream of objects created by the querying {@link GraffitiObjectBase.actor | `actor`}
   * that do not belong to any {@link GraffitiObjectBase.channels | `channels`}
   * and match the given [JSON Schema](https://json-schema.org).
   *
   * @group Query Methods
   */
  abstract recoverOrphans<Schema extends JSONSchema>(
    /**
     * A [JSON Schema](https://json-schema.org) that orphaned objects must satisfy.
     */
    schema: Schema,
    /**
     * An implementation-specific object with information to authenticate the
     * {@link GraffitiObjectBase.actor | `actor`}.
     */
    session: GraffitiSession,
  ): GraffitiObjectStream<Schema>;

  /**
   * Returns statistics about all the {@link GraffitiObjectBase.channels | `channels`}
   * that an {@link GraffitiObjectBase.actor | `actor`} has posted to.
   * This method will not return statistics related to any other actor's channel usage.
   *
   * Like {@link recoverOrphans}, this method is not useful for most applications,
   * but necessary for getting a global view of all an actor's Graffiti data
   * to implement something like Facebook's Activity Log or a debugging interface.
   *
   * Like {@link discover}, objects are returned asynchronously as they are discovered and
   * the stream will end once all leads have been exhausted.
   *
   * @group Query Methods
   *
   * @returns Returns a stream of statistics for each {@link GraffitiObjectBase.channels | `channel`}
   * that the {@link GraffitiObjectBase.actor | `actor`} has posted to.
   */
  abstract channelStats(
    /**
     * An implementation-specific object with information to authenticate the
     * {@link GraffitiObjectBase.actor | `actor`}.
     */
    session: GraffitiSession,
  ): GraffitiChannelStatsStream;

  /**
   * Continues a {@link GraffitiObjectStream} from a given
   * {@link GraffitiObjectStreamReturn.cursor | `cursor`} string.
   * The continuation will return new objects that have been created
   * that match the original stream, and also returns the
   * {@link GraffitiObjectBase.url | `url`}s of objects that
   * have been deleted, as marked by a `tombstone`.
   *
   * The continuation may also include duplicates of objects that
   * were already returned by the original stream. This is dependent
   * on how much state the underlying implementation maintains.
   *
   * The `cursor` allows the client to
   * serialize the state of the stream and continue it later.
   * However this method loses any typing information that was
   * present in the original stream. For better type safety
   * and when serializing is not necessary, use the
   * {@link GraffitiObjectStreamReturn.continue | `continue`} method
   * instead, which is returned along with the `cursor` at the
   * end of the original stream.
   *
   * @throws {@link GraffitiErrorForbidden} if the {@link GraffitiObjectBase.actor | `actor`}
   * provided in the `session` is not the same as the `actor`
   * that initiated the original stream.
   *
   * @group Query Methods
   */
  abstract continueObjectStream(
    cursor: string,
    session?: GraffitiSession | null,
  ): GraffitiObjectStreamContinue<{}>;

  /**
   * Begins the login process. Depending on the implementation, this may
   * involve redirecting to a login page or opening a popup,
   * so it should always be called in response to a gesture, such as clicking
   * a button, due to the [feature-gating browser security feature](https://developer.mozilla.org/en-US/docs/Web/Security/User_activation).
   *
   * The {@link GraffitiSession | session} object is returned
   * asynchronously via {@link Graffiti.sessionEvents | sessionEvents}
   * as a {@link GraffitiLoginEvent} with event type `login`.
   *
   * @group Session Management
   */
  abstract login(
    /**
     * Suggestions for the permissions that the
     * login process should grant. The login process may not
     * provide the exact proposed permissions.
     */
    proposal?: {
      /**
       * A suggested actor to login as. For example, if a user tries to
       * edit a post but are not logged in, the interface can infer that
       * they might want to log in as the actor who created the post
       * they are attempting to edit.
       *
       * Even if provided, the implementation should allow the user
       * to log in as a different actor if they choose.
       */
      actor?: string;
      /**
       * A yet to be defined permissions scope. An application may use
       * this to indicate the minimum necessary scope needed to
       * operate. For example, it may need to be able read private
       * messages from a certain set of channels, or write messages that
       * follow a particular schema.
       *
       * The login process should make it clear what scope an application
       * is requesting and allow the user to enhance or reduce that
       * scope as necessary.
       */
      scope?: {};
    },
  ): Promise<void>;

  /**
   * Begins the logout process for a particular {@link GraffitiSession | session}. Depending on the implementation, this may
   * involve redirecting the user to a logout page or opening a popup,
   * so it should always be called in response to a gesture, such as clicking
   * a button, due to the [feature-gating browser security feature](https://developer.mozilla.org/en-US/docs/Web/Security/User_activation).
   *
   * A confirmation will be returned asynchronously via
   * {@link Graffiti.sessionEvents | sessionEvents}
   * as a {@link GraffitiLogoutEvent} as event type `logout`.
   *
   * @group Session Management
   */
  abstract logout(
    /**
     * The {@link GraffitiSession | session} object to logout.
     */
    session: GraffitiSession,
  ): Promise<void>;

  /**
   * An event target that can be used to listen for the following
   * events and their corresponding event types:
   * - `login` - {@link GraffitiLoginEvent}
   * - `logout` - {@link GraffitiLogoutEvent}
   * - `initialized` - {@link GraffitiSessionInitializedEvent}
   *
   * @group Session Management
   */
  abstract readonly sessionEvents: EventTarget;
}
