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
 * Additionally, {@link synchronize} keeps track of data that a user modifies
 * as well as data received from {@link get} and {@link discover} and routes
 * these changes internally to provide a consistent user experience.
 *
 * Finally, other utility functions provide simple type conversions and
 * allow users to find objects "lost" to forgotten or misspelled channels.
 *
 * @groupDescription CRUD Operations
 * Functions for creating, reading, updating, and deleting Graffiti objects.
 * @groupDescription Query Operations
 * Functions for querying Graffiti objects.
 * @groupDescription Utilities
 * Utility functions for converting between Graffiti objects and URIs.
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
   * Retrieves an object from a given location.
   * If no object exists at that location or if the retrieving
   * {@link GraffitiObjectBase.actor | `actor`} is not included in
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
   * Creates a new object or replaces an existing object.
   * To replace an object the {@link GraffitiObjectBase.actor | `actor`} must be the same as the
   * `actor` that created the object.
   *
   * The supplied object must contain the following fields:
   * - `value`: contains the object's JSON content. We recommend using the
   *   [Activity Vocabulary](https://www.w3.org/TR/activitystreams-vocabulary/)
   *   to describe the object.
   * - `channels`: an array of URIs that the object is associated with.
   *
   * The object may also contain the following optional fields:
   * - `allowed`: an optional array of actor URIs that are allowed to access the object.
   *   If not provided, the object is public. If empty, the object can only be accessed
   *   by the owner.
   * - `name`: a unique name for the object. If not provided, a random one will be generated.
   * - `actor`: the URI of the actor that created the object. If not provided, the actor
   *   from the `session` object will be used.
   * - `source`: the URI of the source that created the object. If not provided, a source
   *   may be inferred depending on the implementation.
   *
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
   * Returns a stream of objects that match the given [JSON Schema](https://json-schema.org)
   * and are contained in at least one of the given `channels`.
   *
   * Objects are returned asynchronously as they are discovered but the stream
   * will end once all objects that currently exist have been discovered.
   * The functions must be polled again for new objects.
   *
   * These objects are fetched from the `pods` specified in the `session`,
   * and a `webId` and `fetch` function may also be provided to retrieve
   * access-controlled objects. See {@link GraffitiSessionBase} for more information.
   *
   * Error messages are returned in the stream rather than thrown
   * to prevent one unstable pod from breaking the entire stream.
   *
   * @group Query Operations
   */
  abstract discover<Schema extends JSONSchema4>(
    channels: string[],
    schema: Schema,
    session?: GraffitiSessionBase,
  ): GraffitiStream<GraffitiObject<Schema>>;

  /**
   * Whenever the user makes changes or retrieves data, that data is streamed
   * to "discoverLocalChanges". This makes apps reactive and prevents there from
   * being any inconsistencies in the data.
   * This discovery remains active until the user calls the "return" method on the
   * iterator.
   */
  /**
   * Takes the same inputs as {@link discover} however, this listens for
   * updates made locally or fetched from other functions to provide a consistent
   * user experience. For example,
   * if a user creates a new object, the object will be streamed to this function
   * and then to the user's UI.
   * If a user refreshes one part of the UI, the object will be streamed to this
   * function and then to the user's UI.
   * It is intended to be used in conjunction with {@link discover}.
   *
   * Returns a stream of objects that match the given [JSON Schema](https://json-schema.org)
   * and are contained in at least one of the given `channels`.
   *
   * Unlike {@link discover}, which queries external pods, this function listens
   * for changes made locally via {@link put}, {@link patch}, and {@link delete}.
   * Additionally, unlike {@link discover}, it does not return a one-time snapshot
   * of objects, but rather streams object changes as they occur. This is useful
   * for updating a UI in real-time without unnecessary polling.
   *
   * @group Query Operations
   */
  abstract synchronize<Schema extends JSONSchema4>(
    channels: string[],
    schema: Schema,
    session?: GraffitiSessionBase,
  ): AsyncGenerator<GraffitiObject<Schema>>;

  /**
   * Returns a list of all channels a user has posted to.
   * This is likely not very useful for most applications, but
   * necessary for certain applications where a user wants a
   * global view of all their Graffiti data.
   *
   * Error messages are returned in the stream rather than thrown
   * to prevent one unstable pod from breaking the entire stream.
   *
   * @group Utilities
   */
  abstract listChannels(session: GraffitiSessionBase): GraffitiStream<{
    channel: string;
    source: string;
    lastModified: Date;
    count: number;
  }>;

  /**
   * Returns a list of all objects a user has posted that are
   * not associated with any channel, i.e. orphaned objects.
   * This is likely not very useful for most applications, but
   * necessary for certain applications where a user wants a
   * global view of all their Graffiti data.
   *
   * Error messages are returned in the stream rather than thrown
   * to prevent one unstable pod from breaking the entire stream.
   *
   * @group Utilities
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
