import { Dropbox } from "dropbox";
import { randomBytes, concatBytes } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { xchacha20poly1305 as cipher } from "@noble/ciphers/chacha";

const ROOT_FOLDER = "/graffiti";

type Authentication =
  | {
      clientId: string;
    }
  | {
      accessToken: string;
    };

export default class DataStore {
  #dropbox: Dropbox;

  constructor(authentication: Authentication) {
    this.#dropbox = new Dropbox(authentication);
  }

  async post(
    channel: string,
    data: Uint8Array,
    uuid?: Uint8Array,
  ): Promise<string> {
    // Generate a random UUID if one is not provided
    uuid = uuid || randomBytes(16);

    // Base64 encode the UUID to use as a file name
    const uuidString = this.#base64Encode(uuid);

    // Encryt the data with the channel as key
    const encrypted = this.#encrypt(channel, data);

    // Get a unique directory corresponding to the channel,
    // without revealing it.
    const directory = this.#channelToDirectory(channel);

    // Make sure the directory exists
    try {
      await this.#dropbox.filesGetMetadata({
        path: directory,
      });
    } catch (e) {
      // If not, create it
      console.log("Error!");
      console.log(e.error);
      console.log(e.status);
      if (e.status === 400) {
        throw "You are not logged in to dropbox";
      } else if (
        e.error.error_summary &&
        e.error.error_summary.startsWith("path/not_found")
      ) {
        await this.#dropbox.filesCreateFolderV2({
          path: directory,
        });
      } else {
        throw e;
      }
    }

    // Upload the file to the directory
    await this.#dropbox.filesUpload({
      path: `${directory}/${uuidString}`,
      contents: encrypted,
      mode: {
        ".tag": "overwrite",
      },
    });

    // Get the shared link to the channel
    try {
      const sharedLinkResult =
        await this.#dropbox.sharingCreateSharedLinkWithSettings({
          path: directory,
        });
      return sharedLinkResult.result.url;
    } catch (e) {
      if (e.error.error_summary.startsWith("shared_link_already_exists")) {
        return e.error.error.shared_link_already_exists.metadata.url;
      } else {
        throw e;
      }
    }
  }

  async *watch(
    channel: string,
    sharedLink: string,
    signal?: AbortSignal,
  ): AsyncGenerator<Uint8Array> {
    // Start the process
    const { result: initialResult } = await this.#dropbox.filesListFolder({
      path: "",
      shared_link: {
        url: sharedLink,
      },
    });
    let hasMore = initialResult.has_more;
    let cursor = initialResult.cursor;
    let entries = initialResult.entries;

    // Create a function that takes a promise
    // and returns a promise that rejects if the signal event fires
    // and otherwise resolves with the input function
    let reject: (reason: any) => void;
    function signalPromise<T>(promise: Promise<T>): Promise<T> {
      return new Promise((resolve, _reject) => {
        reject = _reject;
        promise.then(resolve, reject);
      });
    }
    let aborted = false;
    signal?.addEventListener(
      "abort",
      () => {
        aborted = true;
        reject(signal.reason);
      },
      {
        once: true,
        passive: true,
      },
    );

    while (true) {
      if (aborted) {
        throw signal?.reason;
      } else if (entries.length) {
        // Yield the entries if they exist
        for (const entry of entries) {
          if (
            entry[".tag"] === "file" &&
            entry.is_downloadable &&
            entry.path_display
          ) {
            const file = await signalPromise(
              this.#dropbox.filesDownload({
                path: entry.path_display,
              }),
            );

            // Decrypt the file and yield the result
            yield this.#decrypt(channel, file.result.fileBinary);
          }
        }
        entries = [];
      } else if (hasMore) {
        // Get more results if they exist
        const { result } = await signalPromise(
          this.#dropbox.filesListFolderContinue({
            cursor,
          }),
        );
        hasMore = result.has_more;
        cursor = result.cursor;
        entries = result.entries;
      } else {
        // Long poll for more results
        const { result } = await signalPromise(
          this.#dropbox.filesListFolderLongpoll({
            cursor,
            timeout: 90,
          }),
        );
        hasMore = result.changes;
        const backoff = result.backoff;

        if (backoff) {
          // Sleep for the given time
          await signalPromise(
            new Promise((r) => setTimeout(r, backoff * 1000)),
          );
        }
      }
    }
  }

  #base64Encode(bytes: Uint8Array): string {
    const base64 = btoa(String.fromCodePoint(...bytes));
    // Make sure it is url safe
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/\=+$/, "");
  }

  #channelToCipherKey(channel: string): Uint8Array {
    return sha256("c" + channel);
  }

  #channelToDirectory(channel: string): string {
    const infoHash = sha256("x" + channel);
    const infoHashString = this.#base64Encode(infoHash);
    return `${ROOT_FOLDER}/${infoHashString}`;
  }

  #encrypt(channel: string, data: Uint8Array): Uint8Array {
    const cipherKey = this.#channelToCipherKey(channel);
    const cipherNonce = randomBytes(24);
    const encrypted = cipher(cipherKey, cipherNonce).encrypt(data);
    return concatBytes(cipherNonce, encrypted);
  }

  #decrypt(channel: string, encrypted: Uint8Array): Uint8Array {
    const cipherKey = this.#channelToCipherKey(channel);
    const cipherNonce = encrypted.slice(0, 24);
    const cipherData = cipher(cipherKey, cipherNonce);
    let decrypted: Uint8Array;
    try {
      decrypted = cipherData.decrypt(encrypted.slice(24));
    } catch (e) {
      if (e.message == "invalid tag") {
        throw "Wrong channel for this encrypted data";
      } else {
        throw e;
      }
    }
    return decrypted;
  }
}
