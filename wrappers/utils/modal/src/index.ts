import BYOStorage from "@graffiti-garden/byo-storage";
import ActorManager, {
  base64Decode,
  base64Encode,
} from "@graffiti-garden/actor-manager-client";
import LinkService from "@graffiti-garden/link-service-client";
import type { BYOStorageOptions } from "@graffiti-garden/byo-storage";
import type { ActorManagerOptions } from "@graffiti-garden/actor-manager-client";
import { openDB } from "idb";
import type { IDBPDatabase, DBSchema } from "idb";
import { mergeSignals } from "abort-utils";

export interface GraffitiOptions {
  linkServiceURL?: string;
  byoStorage: BYOStorageOptions;
  actorManager?: ActorManagerOptions;
}

export type GraffitiSubscriptionResult =
  | {
      type: "update";
      data: Uint8Array;
      uuid: string;
      actor: string;
    }
  | {
      type: "delete";
      uuid: string;
      actor: string;
    }
  | {
      type: "backlog-complete";
    };

interface CacheDB extends DBSchema {
  "link-actors": {
    key: string; // shared link
    value: string; // actor ID
  };
  "link-cursors": {
    key: string; // shared link
    value: string; // cursor
  };
  data: {
    key: string; // uuid + actor
    value: {
      uuid: string;
      link: string;
      actor: string;
      context: string;
      data: Uint8Array;
    };
    indexes: {
      context: string;
    };
  };
}

interface GraffitiSubscriptionEvent extends Event {
  value?: GraffitiSubscriptionResult;
}

export default class Graffiti {
  #actorManager: ActorManager;
  #byoStorage: BYOStorage;
  #linkService: LinkService;
  #optimisticEvents = new EventTarget();
  #db: Promise<IDBPDatabase<CacheDB>> | undefined;

  constructor(options: GraffitiOptions) {
    this.#actorManager = new ActorManager(options.actorManager);
    this.#byoStorage = new BYOStorage(options.byoStorage);
    this.#linkService = new LinkService(
      this.#actorManager.getPublicKey.bind(this.#actorManager),
      this.#actorManager.sign.bind(this.#actorManager),
      options.linkServiceURL,
    );

    if (typeof indexedDB !== "undefined") {
      this.#db = openDB<CacheDB>("graffiti", 1, {
        upgrade(db) {
          db.createObjectStore("link-actors");
          db.createObjectStore("link-cursors");
          const dataStore = db.createObjectStore("data");
          dataStore.createIndex("context", "context", { unique: false });
        },
      });
    }
  }

  // Expose sub-library functions
  selectActor() {
    this.#actorManager.selectActor();
  }
  async toggleStorageLogIn() {
    await this.#byoStorage.toggleLogIn();
  }
  get loggedInToStorage() {
    return this.#byoStorage.loggedIn;
  }
  get chosenActor() {
    return this.#actorManager.chosenActor;
  }

  async *subscribe(
    context: string,
    signal?: AbortSignal,
  ): AsyncGenerator<GraffitiSubscriptionResult, void, void> {
    // First, check the cache for any existing data
    const tx = (await this.#db)?.transaction("data", "readonly");
    if (tx) {
      const index = tx.store.index("context");
      for await (const cursor of index.iterate(context)) {
        const { uuid, data, actor } = cursor.value;
        yield {
          type: "update",
          uuid,
          data,
          actor,
        };
      }
    }

    let linkServiceBacklogComplete = false;
    let backlogComplete = false;
    const links: Map<
      string,
      {
        link: string;
        abortController: AbortController;
        backlogComplete: boolean;
      }
    > = new Map();
    const eventTarget = new EventTarget();

    // Listen for links in the background
    (async () => {
      for await (const result of this.#linkService.subscribe(context, signal)) {
        if (result.type == "announce") {
          const link = result.link.target;

          // The link ID is used in case of replacements or deletions
          const linkID = base64Encode(result.link.publicKey);

          const existing = links.get(linkID);
          if (existing) {
            if (existing.link === link) {
              // If the link is already being watched, nothing to do
              continue;
            } else {
              // If the link has been replaced, stop the existing watcher
              existing.abortController.abort();
              links.delete(linkID);
            }
          }

          // Don't bother with empty links
          if (!link) continue;

          // Create a new signal and merge it
          const abortController = new AbortController();
          const localSignal = mergeSignals(signal, abortController.signal);
          links.set(linkID, { link, abortController, backlogComplete: false });

          // Listen in the background
          (async () => {
            try {
              // See if there is an existing actor in the cache
              const storedActor = await (
                await this.#db
              )?.get("link-actors", link);

              let actor: string;
              if (storedActor) {
                actor = storedActor;
              } else {
                const actorPublicKey = await this.#byoStorage.getPublicKey(
                  context,
                  link,
                  this.#actorManager.verify.bind(this.#actorManager),
                );
                if (!actorPublicKey) return;
                actor = "actor:" + base64Encode(actorPublicKey);

                // Store in the cache
                await (await this.#db)?.put("link-actors", actor, link);
              }

              // Check for a stored cursor
              const storedCursor = await (
                await this.#db
              )?.get("link-cursors", link);

              for await (const result of this.#byoStorage.subscribe(
                context,
                link,
                {
                  signal: localSignal,
                  cursor: storedCursor,
                },
              )) {
                if (result.type == "update") {
                  // Store the data in the cache
                  const uuid = base64Encode(result.uuid);
                  const data = result.data;
                  await (
                    await this.#db
                  )?.put(
                    "data",
                    {
                      data,
                      uuid,
                      context,
                      link,
                      actor,
                    },
                    uuid + actor,
                  );

                  // Emit an event back to the root
                  const event: GraffitiSubscriptionEvent = new Event(context);
                  event.value = {
                    type: "update",
                    uuid,
                    data,
                    actor,
                  };
                  eventTarget.dispatchEvent(event);
                } else if (result.type === "delete") {
                  // Remove data from the cache
                  await (await this.#db)?.delete("data", result.uuid + actor);

                  // Emit an event back to the root
                  const event: GraffitiSubscriptionEvent = new Event(context);
                  event.value = {
                    type: "delete",
                    uuid: base64Encode(result.uuid),
                    actor,
                  };
                  eventTarget.dispatchEvent(event);
                } else if (result.type === "cursor") {
                  // Store the cursor
                  await (
                    await this.#db
                  )?.put("link-cursors", result.cursor, link);
                } else {
                  // Backlog has fired and we haven't already marked it
                  if (
                    !backlogComplete &&
                    linkServiceBacklogComplete &&
                    !links.get(linkID)?.backlogComplete
                  ) {
                    links.set(linkID, {
                      ...links.get(linkID)!,
                      backlogComplete: true,
                    });
                    // Check if all the links have been finished
                    let finished = true;
                    for (const l of links.values()) {
                      finished &&= l.backlogComplete;
                    }
                    if (finished) {
                      backlogComplete = true;
                      const event: GraffitiSubscriptionEvent = new Event(
                        context,
                      );
                      event.value = {
                        type: "backlog-complete",
                      };
                      eventTarget.dispatchEvent(event);
                    }
                  }
                }
              }
            } finally {
              links.delete(linkID);
            }
          })();
        } else if (result.type == "unannounce") {
          // Get the abort controller and kill it
          const linkID = base64Encode(result.publicKey);
          links.get(linkID)?.abortController.abort();
          links.delete(linkID);
        } else {
          linkServiceBacklogComplete = true;
        }
      }
    })();

    // Listen for the events
    const waitingEvents: GraffitiSubscriptionResult[] = [];
    let resolve: ((value: GraffitiSubscriptionResult) => void) | null = null;

    const onEvent = (event: GraffitiSubscriptionEvent) => {
      const value = event.value;
      if (!value) {
        return;
      } else {
        if (resolve) {
          resolve(value);
          resolve = null;
        } else {
          waitingEvents.push(value);
        }
      }
    };
    this.#optimisticEvents.addEventListener(context, onEvent);
    eventTarget.addEventListener(context, onEvent);

    const signalPromise = new Promise<"aborted">((resolve) => {
      signal?.addEventListener(
        "abort",
        () => {
          resolve("aborted");
        },
        {
          once: true,
          passive: true,
        },
      );
    });

    while (true) {
      if (signal?.aborted) return;

      const waitingEvent = waitingEvents.shift();
      if (waitingEvent) {
        yield waitingEvent;
      } else {
        const out = await Promise.race([
          signalPromise,
          new Promise<GraffitiSubscriptionResult>((r) => (resolve = r)),
        ]);
        if (out === "aborted") {
          return;
        } else {
          yield out;
        }
      }
    }
  }

  async update(
    context: string,
    data: Uint8Array,
    uuid?: string,
  ): Promise<void> {
    const actor = this.#actorManager.chosenActor;
    const actorPublicKey = this.#actorManager.chosenActorPublicKey;
    if (!actor || !actorPublicKey) {
      throw "No actor chosen! Please select an actor first.";
    }

    // Generate a UUID if one isn't provided
    let uuidBytes: Uint8Array;
    if (!uuid) {
      const randomBytes = new Uint8Array(16);
      crypto.getRandomValues(randomBytes);
      uuidBytes = randomBytes;
    } else {
      uuidBytes = base64Decode(uuid);
    }
    const uuidString = base64Encode(uuidBytes);

    // Get existing data if it exists in case of failure
    const existing = await (await this.#db)?.get("data", uuidString + actor);

    // Immediately send an event
    const event: GraffitiSubscriptionEvent = new Event(context);
    event.value = {
      type: "update",
      data,
      uuid: uuidString,
      actor,
    };
    this.#optimisticEvents.dispatchEvent(event);

    try {
      // Add the data to the context directory
      const sharedLink = await this.#byoStorage.update(
        context,
        actorPublicKey,
        uuidBytes,
        data,
      );

      // Sign the directory if not already signed
      const storedActor = await (
        await this.#db
      )?.get("link-actors", sharedLink);
      if (!storedActor) {
        await this.#byoStorage.signDirectory(
          context,
          actorPublicKey,
          this.#actorManager.sign.bind(this.#actorManager),
        );
        await (await this.#db)?.put("link-actors", actor, sharedLink);
      }

      // Check if the shared link is already in the link service
      let needsLink = true;
      for await (const link of this.#linkService.subscribe(context)) {
        if (link.type == "announce") {
          if (link.link.target === sharedLink) {
            needsLink = false;
            break;
          }
        } else if (link.type === "backlog-complete") {
          break;
        }
      }

      // Add the link to the link service if needed
      if (needsLink) {
        const expiration = Date.now() + 100000;
        await this.#linkService.create(context, sharedLink, expiration);
      }
    } catch (e) {
      // If things fail, put the previous data back
      if (existing) {
        event.value.data = existing.data;
      } else {
        event.value = {
          type: "delete",
          uuid: uuidString,
          actor,
        };
      }
      this.#optimisticEvents.dispatchEvent(event);
      throw e;
    }
  }

  async delete(context: string, uuid: string): Promise<void> {
    const actor = this.#actorManager.chosenActor;
    const actorPublicKey = this.#actorManager.chosenActorPublicKey;
    if (!actor || !actorPublicKey) {
      throw "No actor chosen! Please select an actor first.";
    }

    // Get the data in case of failure
    const existing = await (await this.#db)?.get("data", uuid + actor);

    // Optimistically send an event
    const event: GraffitiSubscriptionEvent = new Event(context);
    event.value = {
      type: "delete",
      uuid,
      actor,
    };
    this.#optimisticEvents.dispatchEvent(event);

    try {
      // Delete it from the storage
      const sharedLink = await this.#byoStorage.delete(
        context,
        actorPublicKey,
        base64Decode(uuid),
      );

      // Subscribe to the link to check if the storage is empty
      const abortController = new AbortController();
      const iterator = this.#byoStorage.subscribe(context, sharedLink, {
        signal: abortController.signal,
      });
      // Get a single result and kill the iterator
      (await iterator.next()).value; // cursor
      const next = (await iterator.next()).value; // backlog complete?
      abortController.abort();

      // If the storage is empty, delete the directory at the shared link
      if (next?.type === "backlog-complete") {
        await this.#byoStorage.deleteDirectory(context, actorPublicKey);
        // Remove it from the link service too
        for await (const link of this.#linkService.subscribe(context)) {
          if (link.type == "announce") {
            if (link.link.target === sharedLink) {
              link.link.modify({ target: "" });
              break;
            }
          } else if (link.type === "backlog-complete") {
            break;
          }
        }
      }
    } catch (e) {
      if (existing) {
        event.value = {
          type: "update",
          data: existing.data,
          uuid,
          actor,
        };
        this.#optimisticEvents.dispatchEvent(event);
      }
      throw e;
    }
  }
}
