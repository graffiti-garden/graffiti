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
      type: "cursor";
      cursor: string;
    }
  | {
      type: "backlog-complete";
    };

interface CacheDB extends DBSchema {
  "shared-links": {
    key: string; // directory
    value: string; // string
  };
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

    // Generate a signature
    const signature = await sign(new TextEncoder().encode(sharedLink));

    // Concatenate with the public key
    const signatureWithPublicKey = concatBytes(publicKey, signature);

    // Encrypt the signature with the channel as key
    const encrypted = encrypt(channel, signatureWithPublicKey);

    // Place the signature in the directory
    await this.#dropbox.updateFile(directory, "signature", encrypted);

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

    // Encryt the data with the channel as key
    const encrypted = encrypt(channel, data);

    // Upload the file to the directory
    const uuidString = base64Encode(uuid);
    await this.#dropbox.updateFile(directory, uuidString, encrypted);

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

    // Delete the file from the directory
    await this.#dropbox.deleteFile(directory, uuidString);

    return sharedLink;
  }

  async getPublicKey(
    channel: string,
    sharedLink: string,
    verify: VerifyFunction,
  ): Promise<Uint8Array | null> {
    // Download the public key + signature from the shared link
    let encrypted: Uint8Array;
    try {
      encrypted = await this.#dropbox.downloadFile(sharedLink, "signature");
    } catch (e) {
      if (e.toString() === "File not found") {
        return null;
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
      // Invalid signature
      return null;
    }

    return publicKey;
  }

  async *subscribe(
    channel: string,
    sharedLink: string,
    options?: {
      signal?: AbortSignal;
      cursor?: string;
    },
  ): AsyncGenerator<SubscribeResult, void, void> {
    for await (const result of this.#dropbox.listFiles(sharedLink, options)) {
      if (result.type == "update") {
        if (result.name != "signature") {
          const data = decrypt(channel, result.data);
          const uuid = base64Decode(result.name);

          yield {
            type: "update",
            data,
            uuid,
          };
        }
      } else if (result.type == "delete") {
        const uuid = base64Decode(result.name);

        yield {
          type: "delete",
          uuid,
        };
      } else if (result.type == "cursor") {
        yield {
          type: "cursor",
          cursor: result.cursor,
        };
      } else if (result.type == "backlog-complete") {
        yield {
          type: "backlog-complete",
        };
      }
    }
  }
}
