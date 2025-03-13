import type Ajv from "ajv";
import { Graffiti } from "@graffiti-garden/api";
import type {
  GraffitiSession,
  GraffitiObject,
  JSONSchema,
  GraffitiStream,
} from "@graffiti-garden/api";
import type { GraffitiObjectBase } from "@graffiti-garden/api";
import { Repeater } from "@repeaterjs/repeater";
import type { applyPatch } from "fast-json-patch";
import {
  applyGraffitiPatch,
  compileGraffitiObjectSchema,
  isActorAllowedGraffitiObject,
  maskGraffitiObject,
  unpackLocationOrUri,
} from "@graffiti-garden/implementation-local/utilities";
export type * from "@graffiti-garden/api";

export type GraffitiSynchronizeCallback = (
  oldObject: GraffitiObjectBase,
  newObject?: GraffitiObjectBase,
) => void;

export interface GraffitiSynchronizeOptions {
  /**
   * Allows synchronize to listen to all objects, not just those
   * that the session is allowed to see. This is useful to get a
   * global view of all Graffiti objects passsing through the system,
   * for example to build a client-side cache. Additional mechanisms
   * should be in place to ensure that users do not see objects or
   * properties they are not allowed to see.
   *
   * Default: `false`
   */
  omniscient?: boolean;
}

/**
 * Wraps the [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html)
 * so that changes made or received in one part of an application
 * are automatically routed to other parts of the application.
 * This is an important tool for building responsive
 * and consistent user interfaces, and is built upon to make
 * the [Graffiti Vue Plugin](https://vue.graffiti.garden/variables/GraffitiPlugin.html)
 * and possibly other front-end libraries in the future.
 *
 * Specifically, it provides the following *synchronize*
 * methods for each of the following API methods:
 *
 * | API Method | Synchronize Method |
 * |------------|--------------------|
 * | {@link get} | {@link synchronizeGet} |
 * | {@link discover} | {@link synchronizeDiscover} |
 * | {@link recoverOrphans} | {@link synchronizeRecoverOrphans} |
 *
 * Whenever a change is made via {@link put}, {@link patch}, and {@link delete} or
 * received from {@link get}, {@link discover}, and {@link recoverOrphans},
 * those changes are forwarded to the appropriate synchronize method.
 * Each synchronize method returns an iterator that streams these changes
 * continually until the user calls `return` on the iterator or `break`s out of the loop,
 * allowing for live updates without additional polling.
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
 * @groupDescription Synchronize Methods
 * This group contains methods that listen for changes made via
 * {@link put}, {@link patch}, and {@link delete} or fetched from
 * {@link get}, {@link discover}, and {@link recoverOrphans} and then
 * streams appropriate changes to provide a responsive and consistent user experience.
 */
export class GraffitiSynchronize extends Graffiti {
  protected ajv_: Promise<Ajv> | undefined;
  protected applyPatch_: Promise<typeof applyPatch> | undefined;
  protected readonly graffiti: Graffiti;
  protected readonly callbacks = new Set<GraffitiSynchronizeCallback>();
  protected readonly options: GraffitiSynchronizeOptions;

  channelStats: Graffiti["channelStats"];
  login: Graffiti["login"];
  logout: Graffiti["logout"];
  sessionEvents: Graffiti["sessionEvents"];

  get ajv() {
    if (!this.ajv_) {
      this.ajv_ = (async () => {
        const { default: Ajv } = await import("ajv");
        return new Ajv({ strict: false });
      })();
    }
    return this.ajv_;
  }

  get applyPatch() {
    if (!this.applyPatch_) {
      this.applyPatch_ = (async () => {
        const { applyPatch } = await import("fast-json-patch");
        return applyPatch;
      })();
    }
    return this.applyPatch_;
  }

  /**
   * Wraps a Graffiti API instance to provide the synchronize methods.
   * The GraffitiSyncrhonize class rather than the Graffiti class
   * must be used for all functions for the synchronize methods to work.
   */
  constructor(
    /**
     * The [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html)
     * instance to wrap.
     */
    graffiti: Graffiti,
    options?: GraffitiSynchronizeOptions,
  ) {
    super();
    this.options = options ?? {};
    this.graffiti = graffiti;
    this.channelStats = graffiti.channelStats.bind(graffiti);
    this.login = graffiti.login.bind(graffiti);
    this.logout = graffiti.logout.bind(graffiti);
    this.sessionEvents = graffiti.sessionEvents;
  }

  protected synchronize<Schema extends JSONSchema>(
    matchObject: (object: GraffitiObjectBase) => boolean,
    channels: string[],
    schema: Schema,
    session?: GraffitiSession | null,
  ) {
    const repeater: GraffitiStream<GraffitiObject<Schema>> = new Repeater(
      async (push, stop) => {
        const validate = compileGraffitiObjectSchema(await this.ajv, schema);
        const callback: GraffitiSynchronizeCallback = (
          oldObjectRaw,
          newObjectRaw,
        ) => {
          for (const objectRaw of [newObjectRaw, oldObjectRaw]) {
            if (
              objectRaw &&
              matchObject(objectRaw) &&
              (this.options.omniscient ||
                isActorAllowedGraffitiObject(objectRaw, session))
            ) {
              const object = { ...objectRaw };
              if (!this.options.omniscient) {
                maskGraffitiObject(object, channels, session);
              }
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
   * @group Synchronize Methods
   */
  synchronizeDiscover<Schema extends JSONSchema>(
    ...args: Parameters<typeof Graffiti.prototype.discover<Schema>>
  ): GraffitiStream<GraffitiObject<Schema>> {
    const [channels, schema, session] = args;
    function matchObject(object: GraffitiObjectBase) {
      return object.channels.some((channel) => channels.includes(channel));
    }
    return this.synchronize<Schema>(matchObject, channels, schema, session);
  }

  /**
   * This method has the same signature as {@link get} but
   * listens for changes made via {@link put}, {@link patch}, and {@link delete} or
   * fetched from {@link get}, {@link discover}, and {@link recoverOrphans} and then
   * streams appropriate changes to provide a responsive and consistent user experience.
   *
   * Unlike {@link get}, which returns a single result, this method continuously
   * listens for changes which are output as an asynchronous {@link GraffitiStream}.
   *
   * @group Synchronize Methods
   */
  synchronizeGet<Schema extends JSONSchema>(
    ...args: Parameters<typeof Graffiti.prototype.get<Schema>>
  ): GraffitiStream<GraffitiObject<Schema>> {
    const [locationOrUri, schema, session] = args;
    const uri = unpackLocationOrUri(locationOrUri);
    function matchObject(object: GraffitiObjectBase) {
      return object.url === uri;
    }
    return this.synchronize<Schema>(matchObject, [], schema, session);
  }

  /**
   * This method has the same signature as {@link recoverOrphans} but
   * listens for changes made via
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
  synchronizeRecoverOrphans<Schema extends JSONSchema>(
    ...args: Parameters<typeof Graffiti.prototype.recoverOrphans<Schema>>
  ): GraffitiStream<GraffitiObject<Schema>> {
    const [schema, session] = args;
    function matchObject(object: GraffitiObjectBase) {
      return object.actor === session.actor && object.channels.length === 0;
    }
    return this.synchronize<Schema>(matchObject, [], schema, session);
  }

  /**
   * Streams changes made to *any* object in *any* channel
   * and made by *any* user. You may want to use it in conjuction with
   * {@link GraffitiSynchronizeOptions.omniscient} to get a global view
   * of all Graffiti objects passing through the system. This is useful
   * for building a client-side cache, for example.
   *
   * Be careful using this method. Without additional filters it can
   * expose the user to content out of context.
   */
  synchronizeAll<Schema extends JSONSchema>(
    schema?: Schema,
    session?: GraffitiSession | null,
  ): GraffitiStream<GraffitiObjectBase> {
    return this.synchronize(() => true, [], schema ?? {}, session);
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
    const oldObject = await this.graffiti.put<{}>(...args);
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
      applyGraffitiPatch(await this.applyPatch, prop, args[0], newObject);
    }
    await this.synchronizeDispatch(oldObject, newObject, true);
    return oldObject;
  };

  delete: Graffiti["delete"] = async (...args) => {
    const oldObject = await this.graffiti.delete(...args);
    await this.synchronizeDispatch(oldObject, undefined, true);
    return oldObject;
  };

  protected objectStream<Schema extends JSONSchema>(
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
    return this.objectStream<(typeof args)[1]>(iterator);
  };

  recoverOrphans: Graffiti["recoverOrphans"] = (...args) => {
    const iterator = this.graffiti.recoverOrphans(...args);
    return this.objectStream<(typeof args)[0]>(iterator);
  };
}
