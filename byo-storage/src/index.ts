import Dropbox from "./dropbox";
import { base64Encode, base64Decode, encrypt, decrypt } from "./util";
import { concatBytes } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { openDB } from "idb";
import type { IDBPDatabase, DBSchema } from "idb";
import type { Authentication } from "./dropbox";

export type SubscribeResult =
  | {
      type: "update";
      uuid: Uint8Array;
      data: Uint8Array;
    }
  | {
      type: "delete";
      uuid: Uint8Array;
    }
  | {
      type: "backlog-complete";
    };

interface CacheDB extends DBSchema {
  "public-keys": {
    key: string; // shared link
    value: Uint8Array; // the public key
  };
  "shared-links": {
    key: string; // hidden path
    value: string; // shared link
  };
  cursors: {
    key: string; // shared link
    value: string; // cursor
  };
  data: {
    key: string; // uuid + shared link
    value: {
      uuidPlusSharedLink: string;
      uuid: Uint8Array;
      sharedLink: string;
      data: Uint8Array;
    };
    indexes: {
      sharedLink: string;
    };
  };
}

type OptimisticValue =
  | {
      optimistic: true;
      type: "update";
      data: Uint8Array;
      name: string;
    }
  | {
      optimistic: true;
      type: "delete";
      name: string;
    };

interface OptimisticEvent extends Event {
  value?: OptimisticValue;
}

export type SignFunction = (
  message: Uint8Array,
) => Promise<Uint8Array> | Uint8Array;
export type VerifyFunction = (
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
) => Promise<boolean> | boolean;

export interface BYOStorageOptions {
  authentication: Authentication;
  onLoginStateChange?: (loginState: boolean) => void;
}

export default class BYOStorage {
  #dropbox: Dropbox;
  #db: Promise<IDBPDatabase<CacheDB>> | undefined;
  #optimisticEvents: EventTarget = new EventTarget();

  constructor(options: BYOStorageOptions) {
    // Initialize the Dropbox client
    this.#dropbox = new Dropbox(
      options.authentication,
      options.onLoginStateChange,
    );

    // Initialize caches for shared links, cursors, and data
    if (typeof indexedDB !== "undefined") {
      this.#db = openDB<CacheDB>("byo-storage", 1, {
        upgrade(db) {
          db.createObjectStore("shared-links");
          db.createObjectStore("cursors");
          const dataStore = db.createObjectStore("data", {
            keyPath: "uuidPlusSharedLink",
          });
          dataStore.createIndex("sharedLink", "sharedLink", { unique: false });
        },
      });
    }
  }

  get loggedIn() {
    return this.#dropbox.loggedIn;
  }

  async toggleLogIn() {
    await this.#dropbox.toggleLogIn();
  }

  #channelAndPublicKeyToDirectory(channel: string, publicKey: Uint8Array) {
    if (publicKey.length != 32) throw "Public key must be 32 bytes";

    // Combine the public key and channel
    const publicKeyBase64 = base64Encode(publicKey);
    const plaintextPath = `byo/${publicKeyBase64}/${channel}`;

    // Generate an obscured directory name so no information is
    // leaked about the channel or public key to Dropbox
    const infoHash = sha256(plaintextPath);
    return base64Encode(infoHash);
  }

  async createDirectory(channel: string, publicKey: Uint8Array) {
    const directory = this.#channelAndPublicKeyToDirectory(channel, publicKey);

    // First try to get the shared link from the cache
    const storedSharedLink = await (
      await this.#db
    )?.get("shared-links", directory);

    const sharedLink =
      storedSharedLink ?? (await this.#dropbox.createDirectory(directory));

    // Cache the shared link
    if (!storedSharedLink) {
      await (await this.#db)?.put("shared-links", sharedLink, directory);
    }

    return { directory, sharedLink };
  }

  async deleteDirectory(channel: string, publicKey: Uint8Array) {
    const directory = this.#channelAndPublicKeyToDirectory(channel, publicKey);

    await (await this.#db)?.delete("shared-links", directory);
    await this.#dropbox.deleteDirectory(directory);
  }

  async signDirectory(
    channel: string,
    publicKey: Uint8Array,
    sign: SignFunction,
  ): Promise<{ directory: string; sharedLink: string }> {
    const { directory, sharedLink } = await this.createDirectory(
      channel,
      publicKey,
    );

    // Check in the cache if we have already created a signature
    const storedPublicKey = await (
      await this.#db
    )?.get("public-keys", sharedLink);
    if (storedPublicKey) return { directory, sharedLink };

    // Generate a signature
    const signature = await sign(new TextEncoder().encode(sharedLink));

    // Concatenate with the public key
    const signatureWithPublicKey = concatBytes(publicKey, signature);

    // Encrypt the signature with the channel as key
    const encrypted = encrypt(channel, signatureWithPublicKey);

    // Place the signature in the directory
    await this.#dropbox.updateFile(directory, "signature", encrypted);

    // Cache that we've created a signature
    await (await this.#db)?.put("public-keys", publicKey, sharedLink);

    return { directory, sharedLink };
  }

  async update(
    channel: string,
    publicKey: Uint8Array,
    uuid: Uint8Array,
    data: Uint8Array,
  ): Promise<string> {
    // Make sure the UUID is exactly 16 bytes
    if (uuid.length !== 16) throw "UUID must be 16 bytes";

    // Sign the directory if not already signed
    const { directory, sharedLink } = await this.createDirectory(
      channel,
      publicKey,
    );

    // Fetch the existing data if it exists
    const uuidString = base64Encode(uuid);
    const existing = await (
      await this.#db
    )?.get("data", this.#uuidPlusSharedLink(uuidString, sharedLink));

    // Immediately send a notification, via events,
    // to any watchers of the shared link of the data update
    const event: OptimisticEvent = new Event(sharedLink);
    event.value = {
      optimistic: true,
      type: "update",
      name: uuidString,
      data,
    };
    this.#optimisticEvents.dispatchEvent(event);

    // Encryt the data with the channel as key
    const encrypted = encrypt(channel, data);

    // Upload the file to the directory
    try {
      await this.#dropbox.updateFile(directory, uuidString, encrypted);
    } catch (e) {
      // Send the original data in case of failure
      if (existing) {
        event.value.data = existing.data;
      } else {
        // Or a deletion
        event.value = {
          optimistic: true,
          type: "delete",
          name: uuidString,
        };
      }
      this.#optimisticEvents.dispatchEvent(event);
      throw e;
    }

    return sharedLink;
  }

  async delete(
    channel: string,
    publicKey: Uint8Array,
    uuid: Uint8Array,
  ): Promise<string> {
    // Base64 encode the UUID to use as a file name
    const uuidString = base64Encode(uuid);

    // Make sure the directory exists
    const { directory, sharedLink } = await this.createDirectory(
      channel,
      publicKey,
    );

    // Get the existing data if it exists
    const existing = await (
      await this.#db
    )?.get("data", this.#uuidPlusSharedLink(uuidString, sharedLink));

    // Immediately send a notification, via events,
    // to any watchers of the shared link of the data deletion
    const event: OptimisticEvent = new Event(sharedLink);
    event.value = {
      optimistic: true,
      type: "delete",
      name: uuidString,
    };
    this.#optimisticEvents.dispatchEvent(event);

    // Delete the file from the directory
    try {
      await this.#dropbox.deleteFile(directory, uuidString);
    } catch (e) {
      // Send the original data in case of failure
      if (existing) {
        event.value = {
          optimistic: true,
          type: "update",
          name: uuidString,
          data: existing.data,
        };
        this.#optimisticEvents.dispatchEvent(event);
      }
      throw e;
    }

    return sharedLink;
  }

  async getPublicKey(
    channel: string,
    sharedLink: string,
    verify: VerifyFunction,
  ) {
    // Lookup the public key in the cache
    const storedPublicKey = await (
      await this.#db
    )?.get("public-keys", sharedLink);
    if (storedPublicKey) return storedPublicKey;

    // If not in the cache,
    // download the public key + signature from the shared link
    let encrypted: Uint8Array;
    try {
      encrypted = await this.#dropbox.downloadFile(sharedLink, "signature");
    } catch (e) {
      if (e.toString() === "File not found") {
        throw "Signature not found";
      } else {
        throw e;
      }
    }

    // Decrypt the signature with the channel as key
    const decrypted = decrypt(channel, encrypted);

    // Split apart the public key and signature
    const publicKey = decrypted.slice(0, 32);
    const signature = decrypted.slice(32);

    // Verify the signature
    const sharedLinkBytes = new TextEncoder().encode(sharedLink);
    if (!verify(signature, sharedLinkBytes, publicKey)) {
      throw "Signature is invalid!";
    }

    // Store the public key in the cache
    await (await this.#db)?.put("public-keys", publicKey, sharedLink);

    return publicKey;
  }

  async *subscribe(
    channel: string,
    sharedLink: string,
    signal?: AbortSignal,
  ): AsyncGenerator<SubscribeResult, never, void> {
    // First load data from the cache if it exists
    const tx = (await this.#db)?.transaction("data", "readonly");
    if (tx) {
      const index = tx.store.index("sharedLink");
      for await (const cursor of index.iterate(sharedLink)) {
        const { uuid, data } = cursor.value;
        yield {
          type: "update",
          uuid,
          data,
        };
      }
    }

    // Get the cursor from the cache if it exists
    const storedCursor = await (await this.#db)?.get("cursors", sharedLink);

    const iterator = this.#dropbox.listFiles(sharedLink, {
      cursor: storedCursor,
      signal,
    });

    // Create a listener for optimistic events
    let resolve: ((value: OptimisticValue) => void) | null = null;
    const waitingResults: Array<OptimisticValue> = [];
    this.#optimisticEvents.addEventListener(
      sharedLink,
      (event: OptimisticEvent) => {
        const value = event.value;
        if (!value) {
          return;
        } else {
          if (resolve) {
            resolve(value);
            resolve = null;
          } else {
            waitingResults.push(value);
          }
        }
      },
      {
        passive: true,
      },
    );
    function optimisticResult() {
      return new Promise<OptimisticValue>((_resolve) => {
        const shifted = waitingResults.shift();
        if (shifted) {
          _resolve(shifted);
        } else {
          resolve = _resolve;
        }
      });
    }
    async function nextResult() {
      return (await iterator.next()).value;
    }

    let optimistic = optimisticResult();
    let next = nextResult();
    while (true) {
      // Get an event from either the optimistic events or the iterator
      const result = await Promise.race([optimistic, next]);
      // Whichever event we get, we need to get the next one
      if ("optimistic" in result) {
        optimistic = optimisticResult();
      } else {
        next = nextResult();
      }

      if (result.type == "update") {
        if (result.name != "signature") {
          // Don't decrypt data routed internally
          const data =
            "optimistic" in result
              ? result.data
              : decrypt(channel, result.data);

          const uuid = base64Decode(result.name);

          // Store the data in the cache
          // but avoid optimistic updates, they're not reliable
          if (!("optimistic" in result)) {
            await (
              await this.#db
            )?.put("data", {
              data,
              uuid,
              sharedLink,
              uuidPlusSharedLink: this.#uuidPlusSharedLink(
                result.name,
                sharedLink,
              ),
            });
          }

          yield {
            type: "update",
            data,
            uuid,
          };
        }
      } else if (result.type == "delete") {
        const uuid = base64Decode(result.name);

        // Remove the data from the cache
        if (!("optimistic" in result)) {
          await (
            await this.#db
          )?.delete("data", this.#uuidPlusSharedLink(result.name, sharedLink));
        }

        yield {
          type: "delete",
          uuid,
        };
      } else if (result.type == "cursor") {
        await (await this.#db)?.put("cursors", result.cursor, sharedLink);
      } else if (result.type == "backlog-complete") {
        yield {
          type: "backlog-complete",
        };
      }
    }
  }

  #uuidPlusSharedLink(uuidString: string, sharedLink: string) {
    return uuidString + "@" + sharedLink;
  }
}
