import type {
  GraffitiObjectUrl,
  GraffitiObject,
  GraffitiObjectBase,
  GraffitiPatch,
  GraffitiSession,
  GraffitiPutObject,
  GraffitiStream,
  ChannelStats,
} from "./2-types";
import type { JSONSchema } from "json-schema-to-ts";

/**
 * This API describes a small but powerful set of methods that
 * can be used to create many different kinds of social media applications,
 * all of which can interoperate.
 * These methods should satisfy all of an application's needs for
 * the communication, storage, and access management of social data.
 * The rest of the application can be built with standard client-side
 * user interface tools to present and interact with the data —
 * no server code necessary.
 * The Typescript source for this API is available at
 * [graffiti-garden/api](https://github.com/graffiti-garden/api).
 *
 * There are several different implementations of this Graffiti API available,
 * including a [federated implementation](https://github.com/graffiti-garden/implementation-federated),
 * that lets users choose where their data is stored,
 * and a [local implementation](https://github.com/graffiti-garden/implementation-local)
 * that can be used for testing and development. In our design of Graffiti, this API is our
 * primary focus as it is the layer that shapes the experience
 * of developing applications. While different implementations can provide tradeoffs between
 * other important properties (e.g. privacy, security, scalability), those properties
 * are useless if the system as a whole doesn't expose useful functionality to developers.
 *
 * On the other side of the stack, there is [Vue plugin](https://github.com/graffiti-garden/wrapper-vue/)
 * that wraps around this API to provide reactivity. Other high-level libraries
 * will be available in the future.
 *
 * ## Overview
 *
 * Graffiti provides applications with methods to create and store data
 * on behalf of their users using standard CRUD operations:
 *  {@link put}, {@link get}, {@link patch}, and {@link delete}.
 * This data can represent both social artifacts (e.g. posts, profiles) and
 * activities (e.g. likes, follows) and is stored as JSON.
 *
 * The social aspect of Graffiti comes from the {@link discover} method
 * which allows applications to find objects that other users made.
 * It is a lot like a traditional query operation, but it only
 * returns objects that have been placed in particular
 * {@link GraffitiObjectBase.channels | `channels`}
 * specified by the discovering application.
 *
 * Graffiti builds on well known concepts and standards wherever possible.
 * JSON Objects can be typed with [JSON Schema](https://json-schema.org/) and patches
 * can be applied with [JSON Patch](https://jsonpatch.com).
 * For interoperability between Graffiti applications, we recommend that
 * objects use established properties from the
 * [Activity Vocabulary](https://www.w3.org/TR/activitystreams-vocabulary/) when available,
 * however it is always possible to create additional properties, contributing
 * to the broader [folksonomy](https://en.wikipedia.org/wiki/Folksonomy).
 *
 * {@link GraffitiObjectBase.channels | `channels`} are one of the major concepts
 * unique to Graffiti along with *interaction relativity*, defined below.
 * Channels create boundaries between public spaces and work to prevent
 * [context collapse](https://en.wikipedia.org/wiki/Context_collapse)
 * even in a highly interoperable environment.
 * Interaction relativity means that all interactions between users are
 * actually atomic single-user operations that can be interpreted in different ways,
 * which also supports interoperability and pluralism.
 *
 * ### Channels
 *
 * {@link GraffitiObjectBase.channels | `channels`}
 * are a way for the creators of social data to express the intended audience of their
 * data. When a user creates data using the {@link put} method, they
 * can place their data in one or more channels.
 * Content consumers using the {@link discover} method will only see data
 * contained in one of the channels they specify.
 *
 * While many channels may be public, they partition
 * the public into different "contexts", mitigating the
 * phenomenon of [context collapse](https://en.wikipedia.org/wiki/Context_collapse) or the "flattening of multiple audiences."
 * Any [URI](https://en.wikipedia.org/wiki/Uniform_Resource_Identifier) can be used as a channel, and so channels can represent people,
 * comment threads, topics, places (real or virtual), pieces of media, and more.
 *
 * For example, consider a comment on a post. If we place that comment in the channel
 * represented by the post's URL, then only people viewing the post will know to
 * look in that channel, giving it visibility akin to a comment on a blog post
 * or comment on Instagram ([since 2019](https://www.buzzfeednews.com/article/katienotopoulos/instagrams-following-activity-tab-is-going-away)).
 * If we also place the comment in the channel represented by the commenter's URI (their
 * {@link GraffitiObjectBase.actor | `actor` URI}), then people viewing the commenter's profile
 * will also see the comment, giving it more visibility, like a reply on Twitter.
 * If we *only* place the comment in the channel represented by the commenter's URI, then
 * it becomes like a quote tweet ([prior to 2020](https://x.com/Support/status/1300555325750292480)),
 * where the comment is only visible to the commenter's followers but not the audience
 * of the original post.
 *
 * The channel model differs from other models of communication such as the
 * [actor model](https://www.w3.org/TR/activitypub/#Overview) used by ActivityPub,
 * the protocol underlying Mastodon, or the [firehose model](https://bsky.social/about/blog/5-5-2023-federation-architecture)
 * used by the AT Protocol, the protocol underlying BlueSky.
 * The actor model is a fusion of direct messaging (like Email) and broadcasting
 * (like RSS) and works well for follow-based communication but struggles
 * to pass information via other rendez-vous.
 * In the actor model, even something as simple as comments can be
 * [very tricky and require server "side effects"](https://seb.jambor.dev/posts/understanding-activitypub-part-3-the-state-of-mastodon/).
 * The firehose model dumps all user data into one public database,
 * which doesn't allow for the carving out of different contexts that we did in our comment
 * example above. In the firehose model a comment will always be visible to *both* the original post's audience and
 * the commenter's followers.
 *
 * In some sense, channels provide a sort of "social access control" by forming
 * expectations about the audiences of different online spaces.
 * As a real world analogy, oftentimes support groups, such as alcoholics
 * anonymous, are open to the public but people in those spaces feel comfortable sharing intimate details
 * because they have expectations about the other people attending.
 * If someone malicious went to support groups just to spread people's secrets,
 * they would be shamed for violating these norms.
 * Similarly, in Graffiti, while you could spider public channels like a search engine
 * to find content about a person, revealing that you've done such a thing
 * would be shameful.
 *
 * Still, social access control is not perfect and so in situations where privacy is important,
 * objects can also be given
 * an {@link GraffitiObjectBase.allowed | `allowed`} list.
 * For example, to send someone a direct message you should put an object representing
 * that message in the channel that represents them (their {@link GraffitiObjectBase.actor | `actor` URI}),
 * so they can find it, *and* set the `allowed` field to only include the recipient,
 * so only they can read it.
 *
 * ### Interaction relativity
 *
 * Interaction relativity posits that "interaction between two individuals only
 * exists relative to an observer," or equivalently, all interaction is [reified](https://en.wikipedia.org/wiki/Reification_(computer_science)).
 * For example, if one user creates a post and another user wants to "like" that post,
 * their like is not modifying the original post, it is simply another data object that points
 * to the post being liked, via its {@link GraffitiObjectBase.url | URL}.
 *
 * ```json
 * {
 *   activity: 'like',
 *   target: 'url-of-the-post-i-like',
 *   actor: 'my-user-id'
 * }
 * ```
 *
 * In Graffiti, all interactions including *moderation* and *collaboration* are relative.
 * This means that applications can freely choose which interactions
 * they want to express to their users and how.
 * For example, one application could have a single fixed moderator,
 * another could allow users to choose which moderators they would like filter their content
 * like [Bluesky's stackable moderation](https://bsky.social/about/blog/03-12-2024-stackable-moderation),
 * and another could implement a fully democratic system like [PolicyKit](https://policykit.org/).
 * Each of these applications is one interpretation of the underlying refieid user interactions and
 * users can freely switch between them.
 *
 * Interaction relativy also allows applications to introduce new sorts of interactions
 * without having to coordinate with all the other existing applications,
 * keeping the ecosystem flexible and interoperable.
 * For example, an application could [add a "Trust" button to posts](https://social.cs.washington.edu/pub_details.html?id=trustnet)
 * and use it assess the truthfulness of posts made on applications across Graffiti.
 * New sorts of interactions like these can be smoothly absorbed by the broader ecosystem
 * as a [folksonomy](https://en.wikipedia.org/wiki/Folksonomy).
 *
 * Interactivy relativity is realized in Graffiti through two design decisions:
 * 1. The creators of objects can only modify their own objects. It is important for
 *    users to be able to change and delete their own content to respect their
 *    [right to be forgotten](https://en.wikipedia.org/wiki/Right_to_be_forgotten),
 *    but beyond self-correction and self-censorship all other interaction is reified.
 *    Many interactions can be reified via pointers, as in the "like" example above, and collaborative
 *    edits can be refieid via [CRDTs](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type).
 * 2. No one owns channels. Unlike IRC/Slack channels or [Matrix rooms](https://matrix.org/docs/matrix-concepts/rooms_and_events/),
 *    anyone can post to any channel, so long as they know the URI of that channel.
 *    It is up to applications to hide content from channels either according to manual
 *    filters or in response to user action.
 *    For example, a user may create a post with the flag `disableReplies`.
 *    Applications could then filter out any content from the replies channel
 *    that the original poster has not specifically approved.
 *
 * @groupDescription CRUD Methods
 * Methods for {@link put | creating}, {@link get | reading}, {@link patch | updating},
 * and {@link delete | deleting} {@link GraffitiObjectBase | Graffiti objects}.
 * @groupDescription Query Methods
 * Methods that retrieve or accumulate information about multiple {@link GraffitiObjectBase | Graffiti objects} at a time.
 * @groupDescription Session Management
 * Methods and properties for logging in and out of a Graffiti implementation.
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
   * @returns The object that was replaced if one one exists, otherwise an object with
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
     * ensure that the PUT object matches subsequent {@link get} or {@link discover}
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
   * not revealed, similar to a BCC.
   *
   * @throws {@link GraffitiErrorNotFound} if the object does not exist, has been deleted, or the user is not
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
   * @returns The original object prior to the patch with its
   * {@link GraffitiObjectBase.lastModified | `lastModified`}
   * property updated to the time of deletion.
   *
   * @throws {@link GraffitiErrorNotFound} if the object does not exist, has already been deleted,
   * or the user is not {@link GraffitiObjectBase.allowed | `allowed`} to access it.
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
   * @returns The object that was deleted its
   * {@link GraffitiObjectBase.lastModified | `lastModified`}
   * property updated to the time of deletion.
   *
   * @throws {@link GraffitiErrorNotFound} if the object does not exist,  has already been deleted,
   * or the user is not {@link GraffitiObjectBase.allowed | `allowed`} to access it.
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
   * Discovers objects created by any user that are contained
   * in at least one of the given {@link GraffitiObjectBase.channels | `channels`}
   * and match the given [JSON Schema](https://json-schema.org).
   *
   * Objects are returned asynchronously as they are discovered but the stream
   * will end once all leads have been exhausted.
   * The {@link GraffitiStream} ends by returning a `continue`
   * method and a `cursor` string, each of which can be be used to poll for new objects.
   * The `continue` method preserves the typing of the stream and the `cursor`
   * string can be serialized to continue the stream after an application is closed
   * and reopened.
   * See the {@link continueStream} method for more information on continuing a stream.
   *
   * `discover` will not return objects that the {@link GraffitiObjectBase.actor | `actor`}
   * is not {@link GraffitiObjectBase.allowed | `allowed`} to access.
   * If the actor is not the creator of a discovered object,
   * the allowed list will be masked to only contain the querying actor if the
   * allowed list is not `undefined` (public). Additionally, if the actor is not the
   * creator of a discovered object, any {@link GraffitiObjectBase.channels | `channels`}
   * not specified by the `discover` method will not be revealed. This masking happens
   * before the supplied schema is applied.
   *
   * Since different implementations may fetch data from multiple sources there is
   * no guarentee on the order that objects are returned in.
   * It is also possible that duplicate objects are returned and their
   * {@link GraffitiObjectBase.lastModified | `lastModified`} fields must be used
   * to determine which object is the most recent.
   *
   * @returns A stream of objects that match the given {@link GraffitiObjectBase.channels | `channels`}
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
  ): GraffitiStream<GraffitiObject<Schema>>;

  /**
   * Discovers objects **not** contained in any
   * {@link GraffitiObjectBase.channels | `channels`}
   * that were created by the querying {@link GraffitiObjectBase.actor | `actor`}
   * and match the given [JSON Schema](https://json-schema.org).
   * Unlike {@link discover}, this method will not return objects created by other users.
   *
   * This method is not useful for most applications, but necessary for
   * getting a global view of all a user's Graffiti data or debugging
   * channel usage.
   *
   * Like {@link discover}, objects are returned asynchronously as they are discovered,
   * the stream will end once all leads have been exhausted, and the stream
   * can be continued using the `continue` method or `cursor` string.
   *
   * @returns A stream of objects created by the querying {@link GraffitiObjectBase.actor | `actor`}
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
  ): GraffitiStream<GraffitiObject<Schema>>;

  /**
   * Returns statistics about all the {@link GraffitiObjectBase.channels | `channels`}
   * that an {@link GraffitiObjectBase.actor | `actor`} has posted to.
   * This is not very useful for most applications, but
   * necessary for certain applications where a user wants a
   * global view of all their Graffiti data or to debug
   * channel usage.

   * Like {@link discover}, objects are returned asynchronously as they are discovered,
      * the stream will end once all leads have been exhausted, and the stream
      * can be continued using the `continue` method or `cursor` string.
   *
   * @group Query Methods
   *
   * @returns A stream of statistics for each {@link GraffitiObjectBase.channels | `channel`}
   * that the {@link GraffitiObjectBase.actor | `actor`} has posted to.
   */
  abstract channelStats(
    /**
     * An implementation-specific object with information to authenticate the
     * {@link GraffitiObjectBase.actor | `actor`}.
     */
    session: GraffitiSession,
  ): GraffitiStream<ChannelStats>;

  /**
   * Continues a {@link GraffitiStream} from a given `cursor` string.
   * The continuation will return new objects that have been created
   * that match the original stream, and also return objects that
   * have been deleted but with a `tombstone` property set to `true`.
   *
   * The continuation may also include duplicates of objects that
   * were already returned by the original stream. This is dependent
   * on how much state the underlying implementation maintains.
   *
   * The `cursor` allows the client to
   * serialize the state of the stream and continue it later.
   * However this method loses any typing information that was
   * present in the original stream. To preserve typing, the
   * use the `continue` method returned with the `cursor` at the
   * end of the original stream.
   *
   * @throws {@link GraffitiErrorForbidden} if the {@link GraffitiObjectBase.actor | `actor`}
   * provided in the `session` is not the same as the `actor`
   * that initiated the original stream.
   *
   * @group Query Methods
   */
  abstract continueStream<T>(
    cursor: string,
    session?: GraffitiSession | null,
  ): GraffitiStream<T>;

  /**
   * Begins the login process. Depending on the implementation, this may
   * involve redirecting the user to a login page or opening a popup,
   * so it should always be called in response to a user action.
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
   * Begins the logout process. Depending on the implementation, this may
   * involve redirecting the user to a logout page or opening a popup,
   * so it should always be called in response to a user action.
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
   * events and they're corresponding event types:
   * - `login` - {@link GraffitiLoginEvent}
   * - `logout` - {@link GraffitiLogoutEvent}
   * - `initialized` - {@link GraffitiSessionInitializedEvent}
   *
   * @group Session Management
   */
  abstract readonly sessionEvents: EventTarget;
}
