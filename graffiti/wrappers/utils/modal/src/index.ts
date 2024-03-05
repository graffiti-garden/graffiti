import BYOStorage from "@graffiti-garden/byo-storage";
import ActorManager, {
  base64Decode,
  base64Encode,
} from "@graffiti-garden/actor-manager-client";
import LinkService from "@graffiti-garden/link-service-client";
import type { BYOStorageOptions } from "@graffiti-garden/byo-storage";
import type { ActorManagerOptions } from "@graffiti-garden/actor-manager-client";
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

interface GraffitiSubscriptionEvent extends Event {
  value?: GraffitiSubscriptionResult;
}

export default class Graffiti {
  #actorManager: ActorManager;
  #byoStorage: BYOStorage;
  #linkService: LinkService;

  constructor(options: GraffitiOptions) {
    this.#actorManager = new ActorManager(options.actorManager);
    this.#byoStorage = new BYOStorage(options.byoStorage);
    this.#linkService = new LinkService(
      this.#actorManager.getPublicKey.bind(this.#actorManager),
      this.#actorManager.sign.bind(this.#actorManager),
      options.linkServiceURL,
    );
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
  ): AsyncGenerator<GraffitiSubscriptionResult, never, undefined> {
    const eventTarget = new EventTarget();
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

          // Get the actor from the storage
          // and listen in the background
          this.#byoStorage
            .getPublicKey(
              context,
              link,
              this.#actorManager.verify.bind(this.#actorManager),
            )
            .then(async (actorPublicKey) => {
              const actor = "actor:" + base64Encode(actorPublicKey);
              for await (const result of this.#byoStorage.subscribe(
                context,
                link,
                localSignal,
              )) {
                if (result.type == "update") {
                  // Emit an event back to the root
                  const event: GraffitiSubscriptionEvent = new Event("result");
                  event.value = {
                    type: "update",
                    uuid: base64Encode(result.uuid),
                    data: result.data,
                    actor,
                  };
                  eventTarget.dispatchEvent(event);
                } else if (result.type === "delete") {
                  // Emit an event back to the root
                  const event: GraffitiSubscriptionEvent = new Event("result");
                  event.value = {
                    type: "delete",
                    uuid: base64Encode(result.uuid),
                    actor,
                  };
                  eventTarget.dispatchEvent(event);
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
                        "result",
                      );
                      event.value = {
                        type: "backlog-complete",
                      };
                      eventTarget.dispatchEvent(event);
                    }
                  }
                }
              }
            });
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
    eventTarget.addEventListener(
      "result",
      (event: GraffitiSubscriptionEvent) => {
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
      },
    );

    let reject: ((reason: any) => void) | null = null;
    signal?.addEventListener("abort", () => {
      if (reject) reject(signal?.reason);
    });

    while (true) {
      if (signal?.aborted) throw signal?.reason;

      const waitingEvent = waitingEvents.shift();
      if (waitingEvent) {
        yield waitingEvent;
      } else {
        yield await new Promise((_resolve, _reject) => {
          resolve = _resolve;
          reject = _reject;
        });
      }
    }
  }

  async update(
    context: string,
    data: Uint8Array,
    uuid?: string,
  ): Promise<void> {
    const actorPublicKey = this.#actorManager.chosenActorPublicKey;
    if (!actorPublicKey) {
      throw "No actor chosen! Please select an actor first.";
    }

    // Sign the context directory
    await this.#byoStorage.signDirectory(
      context,
      actorPublicKey,
      this.#actorManager.sign.bind(this.#actorManager),
    );

    let uuidBytes: Uint8Array;
    if (!uuid) {
      const randomBytes = new Uint8Array(16);
      crypto.getRandomValues(randomBytes);
      uuidBytes = randomBytes;
    } else {
      uuidBytes = base64Decode(uuid);
    }

    // Add the data to the context directory
    const sharedLink = await this.#byoStorage.update(
      context,
      actorPublicKey,
      uuidBytes,
      data,
    );

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
  }

  async delete(context: string, uuid: string): Promise<void> {
    const actorPublicKey = this.#actorManager.chosenActorPublicKey;
    if (!actorPublicKey) {
      throw "No actor chosen! Please select an actor first.";
    }

    // Delete it from the shared storage
    const sharedLink = await this.#byoStorage.delete(
      context,
      actorPublicKey,
      base64Decode(uuid),
    );

    // Subscribe to the link to check if the storage is empty
    const abortController = new AbortController();
    const iterator = this.#byoStorage.subscribe(context, sharedLink);
    // Get a single result and kill the iterator
    const nextType = (await iterator.next()).value.type;
    abortController.abort();

    // If the storage is empty, delete the directory at the shared link
    if (nextType === "backlog-complete") {
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
  }
}
