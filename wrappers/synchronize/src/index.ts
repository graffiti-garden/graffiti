import type {
  Graffiti,
  GraffitiSession,
  JSONSchema,
  GraffitiObjectBase,
  GraffitiObjectStream,
  GraffitiObjectStreamEntry,
  GraffitiObjectUrl,
  GraffitiObjectStreamTombstone,
} from "@graffiti-garden/api";
import {
  compileGraffitiObjectSchema,
  GraffitiErrorNotFound,
  isActorAllowedGraffitiObject,
  maskGraffitiObject,
  unpackObjectUrl,
} from "@graffiti-garden/api";
import { Repeater } from "@repeaterjs/repeater";
export type * from "@graffiti-garden/api";

type GraffitiObjectStreamSuccess<Schema extends JSONSchema> =
  | GraffitiObjectStreamEntry<Schema>
  | GraffitiObjectStreamTombstone;

export type GraffitiSynchronizeCallback = (
  object: GraffitiObjectStreamSuccess<{}>,
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
 *
 * Whenever a change is made via {@link post} and {@link delete} or
 * received from {@link get}, {@link discover}, and {@link continueDiscover},
 * those changes are forwarded to the appropriate synchronize method.
 * Each synchronize method returns an iterator that streams these changes
 * continually until the user calls `return` on the iterator or `break`s out of the loop,
 * allowing for live updates without additional polling.
 *
 * Example 1: Suppose a user publishes a post using {@link post}. If the feed
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
 * Additionally, the library supplies a {@link synchronizeAll} method that can be used
 * to stream all the Graffiti changes that an application is aware of, which can be used
 * for caching or history building.
 *
 * The source code for this library is [available on GitHub](https://github.com/graffiti-garden/wrapper-synchronize/).
 *
 * @groupDescription 0 - Synchronize Methods
 * This group contains methods that listen for changes made via
 * {@link post}, and {@link delete} or fetched from
 * {@link get}, {@link discover}, or {@link continueDiscover} and then
 * streams appropriate changes to provide a responsive and consistent user experience.
 */
export class GraffitiSynchronize implements Graffiti {
  protected readonly graffiti: Graffiti;
  protected readonly callbacks = new Set<GraffitiSynchronizeCallback>();
  protected readonly options: GraffitiSynchronizeOptions;

  login: Graffiti["login"];
  logout: Graffiti["logout"];
  sessionEvents: Graffiti["sessionEvents"];
  postMedia: Graffiti["postMedia"];
  getMedia: Graffiti["getMedia"];
  deleteMedia: Graffiti["deleteMedia"];
  actorToHandle: Graffiti["actorToHandle"];
  handleToActor: Graffiti["handleToActor"];

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
    this.options = options ?? {};
    this.graffiti = graffiti;
    this.login = graffiti.login.bind(graffiti);
    this.logout = graffiti.logout.bind(graffiti);
    this.sessionEvents = graffiti.sessionEvents;
    this.postMedia = graffiti.postMedia.bind(graffiti);
    this.getMedia = graffiti.getMedia.bind(graffiti);
    this.deleteMedia = graffiti.deleteMedia.bind(graffiti);
    this.actorToHandle = graffiti.actorToHandle.bind(graffiti);
    this.handleToActor = graffiti.handleToActor.bind(graffiti);
  }

  protected synchronize<Schema extends JSONSchema>(
    matchObject: (object: GraffitiObjectBase) => boolean,
    channels: string[],
    schema: Schema,
    session?: GraffitiSession | null,
    seenUrls: Set<string> = new Set<string>(),
  ): AsyncGenerator<GraffitiObjectStreamSuccess<Schema>> {
    const repeater = new Repeater<GraffitiObjectStreamSuccess<Schema>>(
      async (push, stop) => {
        const validate = await compileGraffitiObjectSchema(schema);
        const callback: GraffitiSynchronizeCallback = (objectUpdate) => {
          if (objectUpdate?.tombstone) {
            if (seenUrls.has(objectUpdate.object.url)) {
              push(objectUpdate);
            }
          } else if (
            objectUpdate &&
            matchObject(objectUpdate.object) &&
            (this.options.omniscient ||
              isActorAllowedGraffitiObject(objectUpdate.object, session))
          ) {
            // Deep clone the object to prevent mutation
            let object = JSON.parse(
              JSON.stringify(objectUpdate.object),
            ) as GraffitiObjectBase;
            if (!this.options.omniscient) {
              object = maskGraffitiObject(object, channels, session?.actor);
            }
            if (validate(object)) {
              push({ object });
              seenUrls.add(object.url);
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
   * changes made via {@link post} and {@link delete} or
   * fetched from {@link get}, {@link discover}, and {@link continueDiscover}
   * and then streams appropriate changes to provide a responsive and
   * consistent user experience.
   *
   * Unlike {@link discover}, this method continuously listens for changes
   * and will not terminate unless the user calls the `return` method on the iterator
   * or `break`s out of the loop.
   *
   * @group 0 - Synchronize Methods
   */
  synchronizeDiscover<Schema extends JSONSchema>(
    channels: string[],
    schema: Schema,
    session?: GraffitiSession | null,
  ): AsyncGenerator<GraffitiObjectStreamSuccess<Schema>> {
    function matchObject(object: GraffitiObjectBase) {
      return object.channels.some((channel) => channels.includes(channel));
    }
    return this.synchronize<Schema>(matchObject, channels, schema, session);
  }

  /**
   * This method has the same signature as {@link get} but
   * listens for changes made via {@link post}, and {@link delete} or
   * fetched from {@link get}, {@link discover}, and {@link continueDiscover} and then
   * streams appropriate changes to provide a responsive and consistent user experience.
   *
   * Unlike {@link get}, which returns a single result, this method continuously
   * listens for changes which are output as an asynchronous stream, similar
   * to {@link discover}.
   *
   * @group 0 - Synchronize Methods
   */
  synchronizeGet<Schema extends JSONSchema>(
    objectUrl: string | GraffitiObjectUrl,
    schema: Schema,
    session?: GraffitiSession | null | undefined,
  ): AsyncGenerator<GraffitiObjectStreamSuccess<Schema>> {
    const url = unpackObjectUrl(objectUrl);
    function matchObject(object: GraffitiObjectBase) {
      return object.url === url;
    }
    return this.synchronize<Schema>(
      matchObject,
      [],
      schema,
      session,
      new Set<string>([url]),
    );
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
   * @group 0 - Synchronize Methods
   */
  synchronizeAll<Schema extends JSONSchema>(
    schema: Schema,
    session?: GraffitiSession | null,
  ): AsyncGenerator<GraffitiObjectStreamSuccess<Schema>> {
    return this.synchronize<Schema>(() => true, [], schema, session);
  }

  protected async synchronizeDispatch(
    objectUpdate: GraffitiObjectStreamSuccess<{}>,
    waitForListeners = false,
  ) {
    for (const callback of this.callbacks) {
      callback(objectUpdate);
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
    try {
      const object = await this.graffiti.get(...args);
      this.synchronizeDispatch({ object });
      return object;
    } catch (error) {
      if (error instanceof GraffitiErrorNotFound) {
        this.synchronizeDispatch({
          tombstone: true,
          object: { url: unpackObjectUrl(args[0]) },
        });
      }
      throw error;
    }
  };

  // @ts-ignore
  post: Graffiti["post"] = async (...args) => {
    const object = await this.graffiti.post<{}>(...args);
    await this.synchronizeDispatch({ object }, true);
    return object;
  };

  delete: Graffiti["delete"] = async (...args) => {
    const update = {
      tombstone: true,
      object: { url: unpackObjectUrl(args[0]) },
    } as const;
    try {
      const oldObject = await this.graffiti.delete(...args);
      await this.synchronizeDispatch(update, true);
      return oldObject;
    } catch (error) {
      if (error instanceof GraffitiErrorNotFound) {
        await this.synchronizeDispatch(update, true);
      }
      throw error;
    }
  };

  protected objectStreamContinue<Schema extends JSONSchema>(
    iterator: GraffitiObjectStream<Schema>,
  ): GraffitiObjectStream<Schema> {
    const this_ = this;
    return (async function* () {
      while (true) {
        const result = await iterator.next();
        if (result.done) {
          const { continue: continue_, cursor } = result.value;
          return {
            continue: (session?: GraffitiSession | null) =>
              this_.objectStreamContinue<Schema>(continue_(session)),
            cursor,
          };
        }
        if (!result.value.error) {
          const value = result.value as GraffitiObjectStreamSuccess<{}>;
          this_.synchronizeDispatch(value);
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

  continueDiscover: Graffiti["continueDiscover"] = (...args) => {
    const iterator = this.graffiti.continueDiscover(...args);
    return this.objectStreamContinue<{}>(iterator);
  };
}
