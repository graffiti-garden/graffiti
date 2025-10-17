import type Ajv from "ajv";
import { Graffiti } from "@graffiti-garden/api";
import type {
  GraffitiSession,
  JSONSchema,
  GraffitiObjectStream,
  GraffitiObjectStreamContinueEntry,
  GraffitiObjectStreamContinue,
  GraffitiObject,
} from "@graffiti-garden/api";
import type { GraffitiObjectBase } from "@graffiti-garden/api";
import { Repeater } from "@repeaterjs/repeater";
import type { applyPatch } from "fast-json-patch";
import {
  applyGraffitiPatch,
  compileGraffitiObjectSchema,
  isActorAllowedGraffitiObject,
  maskGraffitiObject,
  unpackObjectUrl,
} from "@graffiti-garden/implementation-local/utilities";
export type * from "@graffiti-garden/api";

export type GraffitiSynchronizeCallback = (
  oldObject: GraffitiObjectStreamContinueEntry<{}>,
  newObject?: GraffitiObjectStreamContinueEntry<{}>,
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
 * [See a live example](/example).
 *
 * Specifically, this library provides the following *synchronize*
 * methods to correspond with each of the following Graffiti API methods:
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
 * The source code for this library is [available on GitHub](https://github.com/graffiti-garden/wrapper-synchronize/).
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

  protected get ajv() {
    if (!this.ajv_) {
      this.ajv_ = (async () => {
        const { default: Ajv } = await import("ajv");
        return new Ajv({ strict: false });
      })();
    }
    return this.ajv_;
  }

  protected get applyPatch() {
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
  ): AsyncGenerator<GraffitiObjectStreamContinueEntry<Schema>> {
    const seenUrls = new Set<string>();

    const repeater = new Repeater<GraffitiObjectStreamContinueEntry<Schema>>(
      async (push, stop) => {
        const validate = compileGraffitiObjectSchema(await this.ajv, schema);
        const callback: GraffitiSynchronizeCallback = (
          oldObjectRaw,
          newObjectRaw,
        ) => {
          for (const objectRaw of [newObjectRaw, oldObjectRaw]) {
            if (objectRaw?.tombstone) {
              if (seenUrls.has(objectRaw.object.url)) {
                push(objectRaw);
              }
            } else if (
              objectRaw &&
              matchObject(objectRaw.object) &&
              (this.options.omniscient ||
                isActorAllowedGraffitiObject(objectRaw.object, session))
            ) {
              // Deep clone the object to prevent mutation
              const object = JSON.parse(
                JSON.stringify(objectRaw.object),
              ) as GraffitiObject<{}>;
              if (!this.options.omniscient) {
                maskGraffitiObject(object, channels, session);
              }
              if (validate(object)) {
                push({ object });
                seenUrls.add(object.url);
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

    return (async function* () {
      for await (const i of repeater) yield i;
    })();
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
  ): AsyncGenerator<GraffitiObjectStreamContinueEntry<Schema>> {
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
   * listens for changes which are output as an asynchronous stream, similar
   * to {@link discover}.
   *
   * @group Synchronize Methods
   */
  synchronizeGet<Schema extends JSONSchema>(
    ...args: Parameters<typeof Graffiti.prototype.get<Schema>>
  ): AsyncGenerator<GraffitiObjectStreamContinueEntry<Schema>> {
    const [objectUrl, schema, session] = args;
    const url = unpackObjectUrl(objectUrl);
    function matchObject(object: GraffitiObjectBase) {
      return object.url === url;
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
  ): AsyncGenerator<GraffitiObjectStreamContinueEntry<Schema>> {
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
   *
   * @group Synchronize Methods
   */
  synchronizeAll<Schema extends JSONSchema>(
    schema: Schema,
    session?: GraffitiSession | null,
  ): AsyncGenerator<GraffitiObjectStreamContinueEntry<Schema>> {
    return this.synchronize<Schema>(() => true, [], schema, session);
  }

  protected async synchronizeDispatch(
    oldObject: GraffitiObjectStreamContinueEntry<{}>,
    newObject?: GraffitiObjectStreamContinueEntry<{}>,
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
    this.synchronizeDispatch({ object });
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
    };
    await this.synchronizeDispatch(
      {
        tombstone: true,
        object: oldObject,
      },
      {
        object: newObject,
      },
      true,
    );
    return oldObject;
  };

  patch: Graffiti["patch"] = async (...args) => {
    const oldObject = await this.graffiti.patch(...args);
    const newObject: GraffitiObjectBase = { ...oldObject };
    for (const prop of ["value", "channels", "allowed"] as const) {
      applyGraffitiPatch(await this.applyPatch, prop, args[0], newObject);
    }
    await this.synchronizeDispatch(
      {
        tombstone: true,
        object: oldObject,
      },
      {
        object: newObject,
      },
      true,
    );
    return oldObject;
  };

  delete: Graffiti["delete"] = async (...args) => {
    const oldObject = await this.graffiti.delete(...args);
    await this.synchronizeDispatch(
      {
        tombstone: true,
        object: oldObject,
      },
      undefined,
      true,
    );
    return oldObject;
  };

  protected objectStreamContinue<Schema extends JSONSchema>(
    iterator: GraffitiObjectStreamContinue<Schema>,
  ): GraffitiObjectStreamContinue<Schema> {
    const this_ = this;
    return (async function* () {
      while (true) {
        const result = await iterator.next();
        if (result.done) {
          const { continue: continue_, cursor } = result.value;
          return {
            continue: () => this_.objectStreamContinue<Schema>(continue_()),
            cursor,
          };
        }
        if (!result.value.error) {
          this_.synchronizeDispatch(
            result.value as GraffitiObjectStreamContinueEntry<{}>,
          );
        }
        yield result.value;
      }
    })();
  }

  protected objectStream<Schema extends JSONSchema>(
    iterator: GraffitiObjectStream<Schema>,
  ): GraffitiObjectStream<Schema> {
    const wrapped = this.objectStreamContinue<Schema>(iterator);
    return (async function* () {
      // Filter out the tombstones for type safety
      while (true) {
        const result = await wrapped.next();
        if (result.done) return result.value;
        if (result.value.error || !result.value.tombstone) yield result.value;
      }
    })();
  }

  discover: Graffiti["discover"] = (...args) => {
    const iterator = this.graffiti.discover(...args);
    return this.objectStream<(typeof args)[1]>(iterator);
  };

  recoverOrphans: Graffiti["recoverOrphans"] = (...args) => {
    const iterator = this.graffiti.recoverOrphans(...args);
    return this.objectStream<(typeof args)[0]>(iterator);
  };

  continueObjectStream: Graffiti["continueObjectStream"] = (...args) => {
    const iterator = this.graffiti.continueObjectStream(...args);
    return this.objectStreamContinue<{}>(iterator);
  };
}
