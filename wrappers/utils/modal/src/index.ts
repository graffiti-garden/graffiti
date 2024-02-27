import BYOStorage from "@graffiti-garden/byo-storage";
import ActorManager from "@graffiti-garden/actor-manager-client";
import LinkService from "@graffiti-garden/link-service-client";
import type { BYOStorageOptions } from "@graffiti-garden/byo-storage";
import type { ActorManagerOptions } from "@graffiti-garden/actor-manager-client";

interface GraffitiOptions {
  linkServiceURL: string;
  byoStorage: BYOStorageOptions;
  actorManager: ActorManagerOptions;
}

export default class Graffiti {
  #actorManager: ActorManager;
  #byoStorage: BYOStorage;
  #linkService: LinkService;

  constructor(options: GraffitiOptions) {
    this.#actorManager = new ActorManager(options.actorManager);
    this.#byoStorage = new BYOStorage(options.byoStorage);
    this.#linkService = new LinkService(
      this.#actorManager.getPublicKey,
      this.#actorManager.sign,
      options.linkServiceURL,
    );
  }

  selectActor() {
    this.#actorManager.selectActor();
  }

  async toggleStorageLogIn() {
    await this.#byoStorage.toggleLogIn();
  }

  async post(data: object, contexts: string[]) {
    // Add the actor's ID to the data
    // Create a UUID for the post
    // Add a timestamp?
    // Sign the data
    // Add the data to storage
    // TODO: how to handle updates to a particular post?
  }

  async *subscribe(
    contexts: string[],
  ): AsyncGenerator<object, void, undefined> {
    const iterators = contexts.map((context) =>
      this.#linkService.subscribe(context),
    );
    // for await (const announce of mergeAsyncIterators(iterators)) {
    //   // Start handling the watch
    //   if (announce.type === "announce") {
    //     // Start listening to dropbox posts
    //     const sharedLink = announce.link.target;
    //     const linkID = announce.link.publicKey;
    //     for await (const post of this.#byoStorage.watch(context, sharedLink, signal)) {
    //       yield post;
    //     }
    //   }
    // })
  }
}
