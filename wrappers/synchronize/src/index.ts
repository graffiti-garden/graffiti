import { Graffiti } from "@graffiti-garden/api";
import type {
  GraffitiLocation,
  GraffitiObject,
  GraffitiSession,
  GraffitiStream,
  JSONSchema4,
} from "@graffiti-garden/api";

export abstract class GraffitiSynchronize extends Graffiti {
  /**
   * This method has the same signature as {@link discover} but listens for
   * changes made via {@link put}, {@link patch}, and {@link delete} or
   * fetched from {@link get}, {@link discover}, and {@link recoverOrphans}
   * and then streams appropriate changes to provide a responsive and
   * consistent user experience.
   *
   * Unlike {@link discover}, this method continuously listens for changes
   * and will not terminate unless the user calls the `return` method on the iterator
   * or `break`s out of the loop.
   *
   * Example 1: Suppose a user publishes a post using {@link put}. If the feed
   * displaying that user's posts is using {@link synchronizeDiscover} to listen for changes,
   * then the user's new post will instantly appear in their feed, giving the UI a
   * responsive feel.
   *
   * Example 2: Suppose one of a user's friends changes their name. As soon as the
   * user's application receives one notice of that change (using {@link get}
   * or {@link discover}), then {@link synchronizeDiscover} listeners can be used to update
   * all instance's of that friend's name in the user's application instantly,
   * providing a consistent user experience.
   *
   * @group Synchronize Methods
   */
  abstract synchronizeDiscover<Schema extends JSONSchema4>(
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
    session?: GraffitiSession | null,
  ): GraffitiStream<GraffitiObject<Schema>>;

  /**
   * This method has the same signature as {@link get} but, like {@link synchronizeDiscover},
   * it listens for changes made via {@link put}, {@link patch}, and {@link delete} or
   * fetched from {@link get}, {@link discover}, and {@link recoverOrphans} and then
   * streams appropriate changes to provide a responsive and consistent user experience.
   *
   * Unlike {@link get}, which returns a single result, this method continuously
   * listens for changes which are output as an asynchronous {@link GraffitiStream}.
   *
   * @group Synchronize Methods
   */
  abstract synchronizeGet<Schema extends JSONSchema4>(
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
    session?: GraffitiSession | null,
  ): GraffitiStream<GraffitiObject<Schema>>;

  /**
   * This method has the same signature as {@link recoverOrphans} but,
   * like {@link synchronizeDiscover}, it listens for changes made via
   * {@link put}, {@link patch}, and {@link delete} or fetched from
   * {@link get}, {@link discover}, and {@link recoverOrphans} and then
   * streams appropriate changes to provide a responsive and consistent user experience.
   *
   * Unlike {@link recoverOrphans}, this method continuously listens for changes
   * and will not terminate unless the user calls the `return` method on the iterator
   * or `break`s out of the loop.
   *
   * @group Synchronize Methods
   */
  abstract synchronizeRecoverOrphans<Schema extends JSONSchema4>(
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
}
