import Ajv from "ajv-draft-04";
import { Graffiti } from "@graffiti-garden/api";
import type {
  GraffitiLocation,
  GraffitiSession,
  GraffitiObject,
  JSONSchema4,
  GraffitiStream,
} from "@graffiti-garden/api";
import type { GraffitiObjectBase } from "@graffiti-garden/api";
import { Repeater } from "@repeaterjs/repeater";
import { applyPatch } from "fast-json-patch";
import {
  applyGraffitiPatch,
  attemptAjvCompile,
  isActorAllowedGraffitiObject,
  locationToUri,
  maskGraffitiObject,
  unpackLocationOrUri,
} from "@graffiti-garden/implementation-local/utilities";

type Callback = (
  oldObject: GraffitiObjectBase,
  newObject?: GraffitiObjectBase,
) => void;

/**
 * Wraps a partial implementation of the [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html)
 * to provide the [`synchronize`](https://api.graffiti.garden/classes/Graffiti.html#synchronize) method.
 * The partial implementation must include the primary database methods:
 * `get`, `put`, `patch`, `delete`, and `discover`.
 */
export class GraffitiSynchronize extends Graffiti {
  protected readonly ajv: Ajv;
  protected readonly graffiti: Graffiti;
  protected readonly callbacks = new Set<Callback>();

  channelStats: Graffiti["channelStats"];
  locationToUri: Graffiti["locationToUri"];
  uriToLocation: Graffiti["uriToLocation"];
  login: Graffiti["login"];
  logout: Graffiti["logout"];
  sessionEvents: Graffiti["sessionEvents"];

  /**
   * TODO
   */
  constructor(graffiti: Graffiti, ajv?: Ajv) {
    super();
    this.ajv = ajv ?? new Ajv({ strict: false });
    this.graffiti = graffiti;
    this.channelStats = graffiti.channelStats.bind(graffiti);
    this.locationToUri = graffiti.locationToUri.bind(graffiti);
    this.uriToLocation = graffiti.uriToLocation.bind(graffiti);
    this.login = graffiti.login.bind(graffiti);
    this.logout = graffiti.logout.bind(graffiti);
    this.sessionEvents = graffiti.sessionEvents;
  }

  protected async synchronizeDispatch(
    oldObject: GraffitiObjectBase,
    newObject?: GraffitiObjectBase,
    waitForListeners = false,
  ) {
    for (const callback of this.callbacks) {
      callback(oldObject, newObject);
    }
    if (waitForListeners) {
      // Wait for the listeners to receive
      // their objects, before returning the operation
      // that triggered them.
      //
      // This is important for mutators (put, patch, delete)
      // to ensure the application state has been updated
      // everywhere before returning, giving consistent
      // feedback to the user that the operation has completed.
      //
      // The opposite is true for accessors (get, discover, recoverOrphans),
      // where it is a weird user experience to call `get`
      // in one place and have the application update
      // somewhere else first. It is also less efficient.
      //
      // The hack is simply to await one "macro task cycle".
      // We need to wait for this cycle rather than using
      // `await push` in the callback, because it turns out
      // that `await push` won't resolve until the following
      // .next() call of the iterator, so if only
      // one .next() is called, this dispatch will hang.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  get: Graffiti["get"] = async (...args) => {
    const object = await this.graffiti.get(...args);
    this.synchronizeDispatch(object);
    return object;
  };

  put: Graffiti["put"] = async (...args) => {
    const oldObject = await this.graffiti.put(...args);
    const partialObject = args[0];
    const newObject: GraffitiObjectBase = {
      ...oldObject,
      value: partialObject.value,
      channels: partialObject.channels,
      allowed: partialObject.allowed,
      tombstone: false,
    };
    await this.synchronizeDispatch(oldObject, newObject, true);
    return oldObject;
  };

  patch: Graffiti["patch"] = async (...args) => {
    const oldObject = await this.graffiti.patch(...args);
    const newObject: GraffitiObjectBase = { ...oldObject };
    newObject.tombstone = false;
    for (const prop of ["value", "channels", "allowed"] as const) {
      applyGraffitiPatch(applyPatch, prop, args[0], newObject);
    }
    await this.synchronizeDispatch(oldObject, newObject, true);
    return oldObject;
  };

  delete: Graffiti["delete"] = async (...args) => {
    const oldObject = await this.graffiti.delete(...args);
    await this.synchronizeDispatch(oldObject, undefined, true);
    return oldObject;
  };

  protected objectStream<Schema extends JSONSchema4>(
    iterator: ReturnType<typeof Graffiti.prototype.discover<Schema>>,
  ) {
    const dispatch = this.synchronizeDispatch.bind(this);
    const wrapper = async function* () {
      let result = await iterator.next();
      while (!result.done) {
        if (!result.value.error) {
          dispatch(result.value.value);
        }
        yield result.value;
        result = await iterator.next();
      }
      return result.value;
    };
    return wrapper();
  }

  discover: Graffiti["discover"] = (...args) => {
    const iterator = this.graffiti.discover(...args);
    return this.objectStream(iterator);
  };

  recoverOrphans: Graffiti["recoverOrphans"] = (...args) => {
    const iterator = this.graffiti.recoverOrphans(...args);
    return this.objectStream(iterator);
  };

  protected synchronize<Schema extends JSONSchema4>(
    matchObject: (object: GraffitiObjectBase) => boolean,
    channels: string[],
    schema: Schema,
    session?: GraffitiSession | null,
  ) {
    const validate = attemptAjvCompile(this.ajv, schema);

    const repeater: GraffitiStream<GraffitiObject<Schema>> = new Repeater(
      async (push, stop) => {
        const callback: Callback = (oldObjectRaw, newObjectRaw) => {
          for (const objectRaw of [newObjectRaw, oldObjectRaw]) {
            if (
              objectRaw &&
              matchObject(objectRaw) &&
              isActorAllowedGraffitiObject(objectRaw, session)
            ) {
              const object = { ...objectRaw };
              maskGraffitiObject(object, channels, session);
              if (validate(object)) {
                push({ value: object });
                break;
              }
            }
          }
        };

        this.callbacks.add(callback);
        await stop;
        this.callbacks.delete(callback);
      },
    );

    return repeater;
  }

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
  synchronizeDiscover<Schema extends JSONSchema4>(
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
  ): GraffitiStream<GraffitiObject<Schema>> {
    function matchObject(object: GraffitiObjectBase) {
      return object.channels.some((channel) => channels.includes(channel));
    }
    return this.synchronize(matchObject, channels, schema, session);
  }

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
  synchronizeGet<Schema extends JSONSchema4>(
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
  ): GraffitiStream<GraffitiObject<Schema>> {
    function matchObject(object: GraffitiObjectBase) {
      const objectUri = locationToUri(object);
      const { uri } = unpackLocationOrUri(locationOrUri);
      return objectUri === uri;
    }
    return this.synchronize(matchObject, [], schema, session);
  }

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
  synchronizeRecoverOrphans<Schema extends JSONSchema4>(
    /**
     * A [JSON Schema](https://json-schema.org) that orphaned objects must satisfy.
     */
    schema: Schema,
    /**
     * An implementation-specific object with information to authenticate the
     * {@link GraffitiObjectBase.actor | `actor`}.
     */
    session: GraffitiSession,
  ): GraffitiStream<GraffitiObject<Schema>> {
    function matchObject(object: GraffitiObjectBase) {
      return object.actor === session.actor && object.channels.length === 0;
    }
    return this.synchronize(matchObject, [], schema, session);
  }
}
