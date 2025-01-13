import type {
  GraffitiLocation,
  GraffitiObject,
  GraffitiObjectBase,
  GraffitiPatch,
  GraffitiSession,
  GraffitiPutObject,
  GraffitiStream,
} from "./2-types";
import type { JSONSchema4 } from "json-schema";

/**
 * This API describes a small but mighty set of methods that
 * can be used to create many different kinds of social media applications,
 * all of which can interoperate.
 * These methods should satisfy all of an application's needs for
 * the communication, storage, and access management of social data.
 * The rest of the application can be built with standard client-side
 * user interface tools to present and interact with the data.
 *
 * There are several different implementations of this Graffiti API available,
 * including a decentralized implementation and a local implementation
 * that can be used for testing. In the design of Graffiti we prioritized
 * the design of this API first as it is the layer that shapes the experience
 * of developing applications. While different implementations provide tradeoffs between
 * other important properties (e.g. privacy, security, scalability), those properties
 * are useless if the system as a whole is unusable. Build APIs before protocols!
 *
 * The first group of methods are like standard CRUD methods that
 * allow applications to {@link put}, {@link get}, {@link patch}, and {@link delete}
 * {@link GraffitiObjectBase} objects. The main difference between these
 * methods and standard database methods is that an {@link GraffitiObjectBase.actor | `actor`}
 * (essentially a user) can only modify objects that they created.
 * Applications may also specify an an array of actors that are {@link GraffitiObjectBase.allowed | `allowed`}
 * to access the object and an array of {@link GraffitiObjectBase.channels | `channels`}
 * that the object is associated with.
 *
 * The "social" part of the API is the {@link discover} method, which allows
 * an application to query for objects made by other users.
 * This function only returns objects that are associated with one or more
 * of the {@link GraffitiObjectBase.channels | `channels`}
 * provided by a querying application. This helps to prevent
 * [context collapse](https://en.wikipedia.org/wiki/Context_collapse) and
 * allows users to express their intended audience, even in an interoperable
 * environment.
 *
 * Additionally, {@link synchronize} keeps track of changes to data
 * from any of the aforementioned methods and routes these changes internally
 * to provide a consistent user experience.
 *
 * Finally, other utility functions provide simple type conversions and
 * allow users to find objects "lost" to forgotten or misspelled channels.
 *
 * @groupDescription CRUD Methods
 * Methods for {@link put | creating}, {@link get | reading}, {@link patch | updating},
 * and {@link delete | deleting} {@link GraffitiObjectBase | Graffiti objects}.
 * @groupDescription Query Methods
 * Methods for retrieving multiple {@link GraffitiObjectBase | Graffiti objects} at a time.
 * @groupDescription Session Management
 * Methods and properties for logging in and out of a Graffiti implementation.
 * @groupDescription Utilities
 * Methods for for converting Graffiti objects to and from URIs
 * and for finding lost objects.
 */
export abstract class Graffiti {
  /**
   * Converts a {@link GraffitiLocation} object containing a
   * {@link GraffitiObjectBase.name | `name`}, {@link GraffitiObjectBase.actor | `actor`},
   * and {@link GraffitiObjectBase.source | `source`} into a globally unique URI.
   * The form of this URI is implementation dependent.
   *
   * Its exact inverse is {@link uriToLocation}.
   *
   * @group Utilities
   */
  abstract locationToUri(location: GraffitiLocation): string;

  /**
   * Parses a globally unique Graffiti URI into a {@link GraffitiLocation}
   * object containing a {@link GraffitiObjectBase.name | `name`},
   * {@link GraffitiObjectBase.actor | `actor`}, and {@link GraffitiObjectBase.source | `source`}.
   *
   * Its exact inverse is {@link locationToUri}.
   *
   * @group Utilities
   */
  abstract uriToLocation(uri: string): GraffitiLocation;

  /**
   * An alias of {@link locationToUri}
   *
   * @group Utilities
   */
  objectToUri(object: GraffitiObjectBase) {
    return this.locationToUri(object);
  }

  /**
   * Creates a new {@link GraffitiObjectBase | object} or replaces an existing object.
   * An object can only be replaced by the same {@link GraffitiObjectBase.actor | `actor`}
   * that created it.
   *
   * Replacement occurs when the {@link GraffitiLocation} properties of the supplied object
   * ({@link GraffitiObjectBase.name | `name`}, {@link GraffitiObjectBase.actor | `actor`},
   * and {@link GraffitiObjectBase.source | `source`}) exactly match the location of an existing object.
   *
   * @returns The object that was replaced if one exists or an object with
   * with a `null` {@link GraffitiObjectBase.value | `value`} if this method
   * created a new object.
   * The object will have a {@link GraffitiObjectBase.tombstone | `tombstone`}
   * field set to `true` and a {@link GraffitiObjectBase.lastModified | `lastModified`}
   * field updated to the time of replacement/creation.
   *
   * @group CRUD Methods
   */
  abstract put<Schema>(
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
   * Retrieves an object from a given location.
   * If no object exists at that location or if the retrieving
   * {@link GraffitiObjectBase.actor | `actor`} is not the creator or included in
   * the object's {@link GraffitiObjectBase.allowed | `allowed`} property,
   * a {@link GraffitiErrorNotFound} is thrown.
   *
   * The retrieved object is also type-checked against the provided [JSON schema](https://json-schema.org/)
   * otherwise a {@link GraffitiErrorSchemaMismatch} is thrown.
   *
   * @group CRUD Methods
   */
  abstract get<Schema extends JSONSchema4>(
    /**
     * The location of the object to get.
     */
    locationOrUri: GraffitiLocation | string,
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
    session?: GraffitiSession,
  ): Promise<GraffitiObject<Schema>>;

  /**
   * Patches an existing object at a given location.
   * The patching {@link GraffitiObjectBase.actor | `actor`} must be the same as the
   * `actor` that created the object.
   *
   * @returns The object that was deleted if one exists or an object with
   * with a `null` {@link GraffitiObjectBase.value | `value`} otherwise.
   * The object will have a {@link GraffitiObjectBase.tombstone | `tombstone`}
   * field set to `true` and a {@link GraffitiObjectBase.lastModified | `lastModified`}
   * field updated to the time of deletion.
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
    locationOrUri: GraffitiLocation | string,
    /**
     * An implementation-specific object with information to authenticate the
     * {@link GraffitiObjectBase.actor | `actor`}.
     */
    session: GraffitiSession,
  ): Promise<GraffitiObjectBase>;

  /**
   * Deletes an object from a given location.
   * The deleting {@link GraffitiObjectBase.actor | `actor`} must be the same as the
   * `actor` that created the object.
   *
   * If the object does not exist or has already been deleted,
   * {@link GraffitiErrorNotFound} is thrown.
   *
   * @returns The object that was deleted if one exists or an object with
   * with a `null` {@link GraffitiObjectBase.value | `value`} otherwise.
   * The object will have a {@link GraffitiObjectBase.tombstone | `tombstone`}
   * field set to `true` and a {@link GraffitiObjectBase.lastModified | `lastModified`}
   * field updated to the time of deletion.
   *
   * @group CRUD Methods
   */
  abstract delete(
    /**
     * The location of the object to delete.
     */
    locationOrUri: GraffitiLocation | string,
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
   * The method must be polled again for new objects.
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
   * no guarentee on the order that objects are returned in. Additionally, the method
   * may return objects that have been deleted but with a
   * {@link GraffitiObjectBase.tombstone | `tombstone`} field set to `true` for
   * cache invalidation purposes. Implementations must make aware when, if ever,
   * tombstoned objects are removed.
   *
   * {@link discover} can be used in conjunction with {@link synchronize}
   * to provide a responsive and consistent user experience.
   *
   * @returns A stream of objects that match the given {@link GraffitiObjectBase.channels | `channels`}
   * and [JSON Schema](https://json-schema.org).
   *
   * @group Query Methods
   */
  abstract discover<Schema extends JSONSchema4>(
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
    session?: GraffitiSession,
  ): GraffitiStream<GraffitiObject<Schema>>;

  /**
   * This method has the same signature as {@link discover} but listens for
   * changes made via {@link put}, {@link patch}, and {@link delete} or
   * fetched from {@link get} or {@link discover} and then streams appropriate
   * changes to provide a responsive and consistent user experience.
   *
   * Unlike {@link discover}, this method continuously listens for changes
   * and will not terminate unless the user calls the `return` method on the iterator
   * or `break`s out of the loop.
   *
   * Example 1: Suppose a user publishes a post using {@link put}. If the feed
   * displaying that user's posts is using {@link synchronize} to listen for changes,
   * then the user's new post will instantly appear in their feed, giving the UI a
   * responsive feel.
   *
   * Example 2: Suppose one of a user's friends changes their name. As soon as the
   * user's application receives one notice of that change (using {@link get}
   * or {@link discover}), then {@link synchronize} listeners can be used to update
   * all instance's of that friend's name in the user's application instantly,
   * providing a consistent user experience.
   *
   * @group Query Methods
   */
  abstract synchronize<Schema extends JSONSchema4>(
    /**
     * The {@link GraffitiObjectBase.channels | `channels`} that the objects must be associated with.
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
    session?: GraffitiSession,
  ): GraffitiStream<GraffitiObject<Schema>>;

  /**
   * Returns a list of all {@link GraffitiObjectBase.channels | `channels`}
   * that an {@link GraffitiObjectBase.actor | `actor`} has posted to.
   * This is not very useful for most applications, but
   * necessary for certain applications where a user wants a
   * global view of all their Graffiti data or to debug
   * channel usage.
   *
   * @group Utilities
   *
   * @returns A stream the {@link GraffitiObjectBase.channels | `channel`}s
   * that the {@link GraffitiObjectBase.actor | `actor`} has posted to.
   * The `lastModified` field is the time that the user last modified an
   * object in that channel. The `count` field is the number of objects
   * that the user has posted to that channel.
   */
  abstract listChannels(
    /**
     * An implementation-specific object with information to authenticate the
     * {@link GraffitiObjectBase.actor | `actor`}.
     */
    session: GraffitiSession,
  ): GraffitiStream<{
    channel: string;
    source: string;
    lastModified: string;
    count: number;
  }>;

  /**
   * Returns a list of all {@link GraffitiObjectBase | objects} a user has posted that are
   * not associated with any {@link GraffitiObjectBase.channels | `channel`}, i.e. orphaned objects.
   * This is not very useful for most applications, but
   * necessary for certain applications where a user wants a
   * global view of all their Graffiti data or to debug
   * channel usage.
   *
   * @group Utilities
   *
   * @returns A stream of the {@link GraffitiObjectBase.name | `name`}
   * and {@link GraffitiObjectBase.source | `source`} of the orphaned objects
   * that the {@link GraffitiObjectBase.actor | `actor`} has posted to.
   * The {@link GraffitiObjectBase.lastModified | lastModified} field is the
   * time that the user last modified the orphan and the
   * {@link GraffitiObjectBase.tombstone | `tombstone`} field is `true`
   * if the object has been deleted.
   */
  abstract listOrphans(session: GraffitiSession): GraffitiStream<{
    name: string;
    source: string;
    lastModified: string;
    tombstone: boolean;
  }>;

  /**
   * The age at which a query for a session will be considered expired.
   */
  // abstract readonly maxAge: number;

  /**
   * Begins the login process. Depending on the implementation, this may
   * involve redirecting the user to a login page or opening a popup,
   * so it should always be called in response to a user action.
   *
   * The {@link GraffitiSession | session} object is returned
   * asynchronously via {@link Graffiti.sessionEvents | sessionEvents}
   * as a {@link GraffitiLoginEvent}.
   *
   * @group Session Management
   */
  abstract login(
    /**
     * An optional actor to prompt the user to login as. For example,
     * if a session expired and the user is trying to reauthenticate,
     * or if the user entered their username in an application-side login form.
     *
     * If not provided, the implementation should prompt the user to
     * supply an actor ID along with their other login information
     * (e.g. password).
     */
    actor?: string,
    /**
     * An arbitrary string that will be returned with the
     * {@link GraffitiSession | session} object
     * when the login process is complete.
     * See {@link GraffitiLoginEvent}.
     */
    state?: string,
  ): Promise<void>;

  /**
   * Begins the logout process. Depending on the implementation, this may
   * involve redirecting the user to a logout page or opening a popup,
   * so it should always be called in response to a user action.
   *
   * A confirmation will be returned asynchronously via
   * {@link Graffiti.sessionEvents | sessionEvents}
   * as a {@link GraffitiLogoutEvent}.
   *
   * @group Session Management
   */
  abstract logout(
    /**
     * The {@link GraffitiSession | session} object to logout.
     */
    session: GraffitiSession,
    /**
     * An arbitrary string that will be returned with the
     * when the logout process is complete.
     * See {@link GraffitiLogoutEvent}.
     */
    state?: string,
  ): Promise<void>;

  /**
   * An event target that can be used to listen for `login`
   * and `logout` events. They are custom events of types
   * {@link GraffitiLoginEvent`} and {@link GraffitiLogoutEvent }
   * respectively.
   *
   * @group Session Management
   */
  abstract readonly sessionEvents: EventTarget;
}

/**
 * This is a factory function that produces an instance of
 * the {@link Graffiti} class. Since the Graffiti class is
 * abstract, factory functions provide an easy way to
 * swap out different implementations.
 */
export type GraffitiFactory = () => Graffiti;
