import type {
  GraffitiLocation,
  GraffitiObject,
  GraffitiObjectBase,
  GraffitiPatch,
  GraffitiSessionBase,
  GraffitiPutObject,
  GraffitiStream,
} from "./types";
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
 * The first group of methods are like standard CRUD operations that
 * allow applications to {@link put}, {@link get}, {@link patch}, and {@link delete}
 * {@link GraffitiObjectBase} objects. The main difference between these
 * methods and standard database operations is that an {@link GraffitiObjectBase.actor | `actor`}
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
 * @groupDescription CRUD Operations
 * Methods for {@link put | creating}, {@link get | reading}, {@link patch | updating},
 * and {@link delete | deleting} {@link GraffitiObjectBase | Graffiti objects}.
 * @groupDescription Query Operations
 * Methods for retrieving multiple {@link GraffitiObjectBase | Graffiti objects} at a time.
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
   * with a `null` {@link GraffitiObjectBase.value | `value`} if this operation
   * created a new object.
   * The object will have a {@link GraffitiObjectBase.tombstone | `tombstone`}
   * field set to `true` and a {@link GraffitiObjectBase.lastModified | `lastModified`}
   * field updated to the time of replacement/creation.
   *
   * @group CRUD Operations
   */
  abstract put<Schema>(
    /**
     * The object to be put. This object is statically type-checked against the [JSON schema](https://json-schema.org/) that can be optionally provided
     * as the generic type parameter. We highly recommend providing a schema to
     * ensure that the PUT object matches subsequent {@link get} or {@link discover}
     * operations.
     */
    object: GraffitiPutObject<Schema>,
    /**
     * An implementation-specific object with information to authenticate the
     * {@link GraffitiObjectBase.actor | `actor`}.
     */
    session: GraffitiSessionBase,
  ): Promise<GraffitiObjectBase>;

  /**
   * Retrieves an object from a given location.
   * If no object exists at that location or if the retrieving
   * {@link GraffitiObjectBase.actor | `actor`} is not the creator or included in
   * the object's {@link GraffitiObjectBase.allowed | `allowed`} property,
   * an error is thrown.
   *
   * The retrieved object is also type-checked against the provided [JSON schema](https://json-schema.org/)
   * otherwise an error is thrown.
   *
   * @group CRUD Operations
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
    session?: GraffitiSessionBase,
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
   * @group CRUD Operations
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
    session: GraffitiSessionBase,
  ): Promise<GraffitiObjectBase>;

  /**
   * Deletes an object from a given location.
   * The deleting {@link GraffitiObjectBase.actor | `actor`} must be the same as the
   * `actor` that created the object.
   *
   * @returns The object that was deleted if one exists or an object with
   * with a `null` {@link GraffitiObjectBase.value | `value`} otherwise.
   * The object will have a {@link GraffitiObjectBase.tombstone | `tombstone`}
   * field set to `true` and a {@link GraffitiObjectBase.lastModified | `lastModified`}
   * field updated to the time of deletion.
   *
   * @group CRUD Operations
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
    session: GraffitiSessionBase,
  ): Promise<GraffitiObjectBase>;

  /**
   * Returns a stream of {@link GraffitiObjectBase | objects}
   * that are contained in at least one of the given {@link GraffitiObjectBase.channels | `channels`}
   * and match the given [JSON Schema](https://json-schema.org)
   *
   * Objects are returned asynchronously as they are discovered but the stream
   * will end once all leads have been exhausted.
   * The method must be polled again for new objects.
   *
   * {@link discover} can be used in conjunction with {@link synchronize}
   * to provide a responsive and consistent user experience.
   *
   * @group Query Operations
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
    session?: GraffitiSessionBase,
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
   * @group Query Operations
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
    session?: GraffitiSessionBase,
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
    session: GraffitiSessionBase,
  ): GraffitiStream<{
    channel: string;
    source: string;
    lastModified: Date;
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
  abstract listOrphans(session: GraffitiSessionBase): GraffitiStream<{
    name: string;
    source: string;
    lastModified: Date;
    tombstone: boolean;
  }>;
}

/**
 * This is a factory function that produces an instance of
 * the {@link Graffiti} class. Since the Graffiti class is
 * abstract, factory functions provide an easy way to
 * swap out different implementations.
 */
export type UseGraffiti = () => Graffiti;
