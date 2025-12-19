import type {
  GraffitiObjectUrl,
  GraffitiObject,
  GraffitiObjectBase,
  GraffitiSession,
  GraffitiPostObject,
  GraffitiObjectStream,
  GraffitiObjectStreamContinue,
  GraffitiMedia,
  GraffitiPostMedia,
  GraffitiMediaRequirements,
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
 * methods to interact with data objects using standard database operations ({@link post}, {@link get}, and {@link delete}),
 * and a method to {@link discover} data objects created by others.
 * These data objects have a couple structured properties:
 * - {@link GraffitiObjectBase.url | `url`} (string): A globally unique identifier and locator for the object.
 * - {@link GraffitiObjectBase.actor | `actor`} (string): An unforgeable identifier for the creator of the object.
 * - {@link GraffitiObjectBase.allowed | `allowed`} (string[] | undefined): An array of the actors who are allowed to access the object (undefined for public objects).
 * - {@link GraffitiObjectBase.channels | `channels`} (string[]): An array of the *contexts* in which the object should appear.
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
 * @groupDescription 1 - Single-Object Methods
 * Methods for {@link post | creating}, {@link get | reading},
 * and {@link delete | deleting} {@link GraffitiObjectBase | Graffiti objects}.
 * @groupDescription 2 - Multi-Object Methods
 * Methods that retrieve or accumulate information about multiple {@link GraffitiObjectBase | Graffiti objects} at a time.
 * @groupDescription 3 - Media Methods
 * Methods for {@link postMedia | creating}, {@link getMedia | reading},
 * and {@link deleteMedia | deleting} media data.
 * @groupDescription 4 - Identity Methods
 * Methods and properties for logging in and out.
 */
export abstract class Graffiti {
  /**
   * Creates a new {@link GraffitiObjectBase | object}.
   *
   * @returns Returns the object that has been posted, complete with its
   * assigned {@link GraffitiObjectBase.url | `url`} and
   * {@link GraffitiObjectBase.actor | `actor`}.
   *
   * @group 1 - Single-Object Methods
   */
  abstract post<Schema extends JSONSchema>(
    /**
     * An object to post, minus its {@link GraffitiObjectBase.url | `url`} and
     * {@link GraffitiObjectBase.actor | `actor`}, which will be assigned once posted.
     * This object is statically type-checked against the [JSON schema](https://json-schema.org/) that can be optionally provided
     * as the generic type parameter. It is recommended to use a schema to
     * ensure that the posted object matches subsequent {@link get} or {@link discover}
     * methods.
     */
    partialObject: GraffitiPostObject<Schema>,
    /**
     * An implementation-specific object with information to authenticate the
     * {@link GraffitiObjectBase.actor | `actor`}.
     */
    session: GraffitiSession,
  ): Promise<GraffitiObject<Schema>>;

  /**
   * Retrieves an object from a given {@link GraffitiObjectBase.url | `url`} matching
   * the provided `schema`.
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
   * @throws {@link GraffitiErrorInvalidSchema} If an invalid schema is provided.
   *
   * @group 1 - Single-Object Methods
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
   * Deletes an object from a given {@link GraffitiObjectBase.url | `url`}
   * that had previously been {@link post | `post`ed}.
   * The deleting {@link GraffitiObjectBase.actor | `actor`} must be the same as the
   * `actor` that created the object.
   *
   * @throws {@link GraffitiErrorNotFound} if the object does not exist, has already been deleted,
   * or the actor is not {@link GraffitiObjectBase.allowed | `allowed`} to access it.
   *
   * @throws {@link GraffitiErrorForbidden} if the {@link GraffitiObjectBase.actor | `actor`}
   * is not the same `actor` as the one who created the object.
   *
   * @group 1 - Single-Object Methods
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
  ): Promise<void>;

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
   * `discover` will not return objects that the querying {@link GraffitiObjectBase.actor | `actor`}
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
   *
   * @throws {@link GraffitiErrorInvalidSchema} if an invalid schema is provided.
   * Discovery is lazy and will not throw until the iterator is consumed.
   *
   * @returns Returns a stream of objects that match the given {@link GraffitiObjectBase.channels | `channels`}
   * and [JSON Schema](https://json-schema.org).
   *
   * @group 2 - Multi-Object Methods
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
   * Continues a {@link GraffitiObjectStream} from a given
   * {@link GraffitiObjectStreamReturn.cursor | `cursor`} string.
   * The continuation will return new objects that have been {@link post | `post`ed}
   * that match the original stream, and also returns the
   * {@link GraffitiObjectBase.url | `url`}s of objects that
   * have been {@link delete | `delete`d}, as marked by a `tombstone`.
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
   * @throws {@link GraffitiErrorNotFound} upon iteration
   * if the cursor is invalid or expired.
   *
   * @throws {@link GraffitiErrorForbidden} upon iteration
   * if the {@link GraffitiObjectBase.actor | `actor`}
   * provided in the `session` is not the same as the `actor`
   * that initiated the original stream.
   *
   * @group 2 - Multi-Object Methods
   */
  abstract continueDiscover(
    cursor: string,
    session?: GraffitiSession | null,
  ): GraffitiObjectStreamContinue<{}>;

  /**
   * Uploads media data, such as an image or video.
   *
   * Unlike structured {@link GraffitiObjectBase | objects},
   * media is not indexed for {@link discover | `discover`y} and
   * must be retrieved by its exact URL using {@link getMedia}
   *
   * @returns The URL that the media was posted to.
   *
   * @group 3 - Media Methods
   */
  abstract postMedia(
    /**
     * The media data to upload, and optionally
     * an {@link GraffitiObjectBase.allowed | `allowed`}
     * list of actors that can view it.
     */
    media: GraffitiPostMedia,
    /**
     * An implementation-specific object with information to authenticate the
     * {@link GraffitiObjectBase.actor | `actor`}.
     */
    session: GraffitiSession,
  ): Promise<string>;

  /**
   * Deletes media previously {@link postMedia | `post`ed} to a given URL.
   *
   * @throws {@link GraffitiErrorNotFound} if no media at that URL exists.
   *
   * @throws {@link GraffitiErrorForbidden} if the {@link GraffitiObjectBase.actor | `actor`}
   * provided in the `session` is not the same as the `actor` that {@link postMedia | `post`ed}
   * the media.
   *
   * @group 3 - Media Methods
   */
  abstract deleteMedia(
    /**
     * A globally unique identifier and locator for the media.
     */
    url: string,
    /**
     * An implementation-specific object with information to authenticate the
     * {@link GraffitiObjectBase.actor | `actor`}.
     */
    session: GraffitiSession,
  ): Promise<void>;

  /**
   * Retrieves media from the given media URL, adhering to the given requirements.
   *
   * @throws {@link GraffitiErrorNotFound} if no media at that URL exists.
   *
   * @throws {@link GraffitiErrorTooLarge} if the media exceeds the given `maxBytes`.
   *
   * @throws {@link GraffitiErrorNotAcceptable} if the media does not match the given
   * `accept` specification.
   *
   * @returns The URL of the retrieved media, as a [Blob](https://developer.mozilla.org/en-US/docs/Web/API/Blob)
   * and the {@link GraffitiObjectBase.actor | `actor`} that posted it.
   *
   * @group 3 - Media Methods
   */
  abstract getMedia(
    /**
     * A globally unique identifier and locator for the media.
     */
    mediaUrl: string,
    /**
     * A set of requirements the retrieved media must meet.
     */
    requirements: GraffitiMediaRequirements,
    /**
     * An implementation-specific object with information to authenticate the
     * {@link GraffitiObjectBase.actor | `actor`}.
     */
    session?: GraffitiSession | null,
  ): Promise<GraffitiMedia>;

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
   * @group 4 - Identity Methods
   */
  abstract login(
    /**
     * A suggested actor to login as. For example, if a user tries to
     * edit a post but are not logged in, the interface can infer that
     * they might want to log in as the actor who created the post
     * they are attempting to edit.
     *
     * Even if provided, the implementation should allow the user
     * to log in as a different actor if they choose.
     */
    actor?: string,
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
   * @group 4 - Identity Methods
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
   * @group 4 - Identity Methods
   */
  abstract readonly sessionEvents: EventTarget;

  /**
   * Retrieves the human-readable handle associated
   * with the given actor. The handle may change over time
   * and so it should be used for display purposes only.
   *
   * The inverse of {@link handleToActor}.
   *
   * @throws {@link GraffitiErrorNotFound} if a handle cannot be
   * found for the given actor.
   *
   * @returns A human-readable handle for the given actor.
   *
   * @group 4 - Identity Methods
   */
  abstract actorToHandle(actor: string): Promise<string>;

  /**
   * Retrieves the actor ID associated with the given handle.
   *
   * The inverse of {@link actorToHandle}.
   *
   * @throws {@link GraffitiErrorNotFound} if there is no actor
   * with the given handle.
   *
   * @returns The actor ID for the given handle.
   *
   * @group 4 - Identity Methods
   */
  abstract handleToActor(handle: string): Promise<string>;
}
