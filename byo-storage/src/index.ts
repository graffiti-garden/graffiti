import { Dropbox } from "dropbox";
import { randomBytes, concatBytes } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { xchacha20poly1305 as cipher } from "@noble/ciphers/chacha";
import {
  createStore as createStoreDB,
  set as setDB,
  get as getDB,
} from "idb-keyval";
import type { UseStore } from "idb-keyval";

const ROOT_FOLDER = "/graffiti";

type Authentication =
  | {
      clientId: string;
      accessToken?: string;
    }
  | {
      accessToken: string;
    };

const indexDBExists = typeof indexedDB !== "undefined";
const createStore = indexDBExists ? createStoreDB : () => undefined;
const set = indexDBExists ? setDB : () => null;
const get = indexDBExists ? getDB : () => undefined;

export default class BYOStorage {
  #dropbox: Dropbox;
  #sharedLinkCache: UseStore | undefined;

  constructor(authentication: Authentication) {
    const storedToken =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("dropbox_access_token")
        : null;
    if ("accessToken" in authentication) {
      // Nothing to do
    } else if (storedToken) {
      authentication.accessToken = storedToken;
    } else if (!!window.location.hash) {
      const loc = window.location;
      const urlParams = new URLSearchParams(loc.hash.slice(1));
      const accessToken = urlParams.get("access_token");
      const state = urlParams.get("state");
      if (accessToken && state) {
        // Make sure the state matches the one we stored
        const storedState = localStorage.getItem("dropbox_auth_state");
        if (state === storedState) {
          authentication.accessToken = accessToken;
          localStorage.setItem("dropbox_access_token", accessToken);
          // Drop the state from local storage
          localStorage.removeItem("dropbox_auth_state");
        }

        // Remove the access token from the URL
        for (const param of [
          "access_token",
          "token_type",
          "expires_in",
          "scope",
          "uid",
          "account_id",
          "state",
        ]) {
          urlParams.delete(param);
        }
        const hashString = urlParams.toString();
        history.replaceState(
          null,
          "",
          loc.pathname +
            loc.search +
            (hashString.length ? "#" + hashString : ""),
        );
      }
    }

    // Initialize and refresh the access token if necessary
    this.#dropbox = new Dropbox(authentication);
    this.#dropbox.auth.checkAndRefreshAccessToken();

    // Initialize the shared link
    this.#sharedLinkCache = createStore("byo-storage-shared-links", "keyval");
  }

  get loggedIn() {
    return !!this.#dropbox.auth.getAccessToken();
  }

  async toggleLogIn() {
    if (!this.loggedIn) {
      const myURL = new URL(window.location.href);
      myURL.search = "";

      // Generate a random state string to prevent CSRF attacks
      const stateBytes = randomBytes(16);
      const state = this.#base64Encode(stateBytes);
      // Store the state in local storage
      localStorage.setItem("dropbox_auth_state", state);

      // generate a random 10-charachter string
      const authURL = await this.#dropbox.auth.getAuthenticationUrl(
        myURL.toString(),
        state,
        "token",
        "legacy",
      );
      window.location.href = authURL;
    } else {
      localStorage.removeItem("dropbox_access_token");
      this.#dropbox.auth.setAccessToken(null);
    }
  }

  #checkIfLoggedIn() {
    if (!this.loggedIn) {
      throw "You are not logged in to dropbox";
    }
  }

  async getSharedLink(channel: string): Promise<string> {
    // First try to get the shared link from the cache
    let sharedLink: string | undefined = await get(
      channel,
      this.#sharedLinkCache,
    );
    if (sharedLink) {
      return sharedLink;
    }

    const directory = this.#channelToDirectory(channel);

    // Get the shared link to the channel
    try {
      // See if the shared link already exists on dropbox
      const sharedLinkResult =
        await this.#dropbox.sharingCreateSharedLinkWithSettings({
          path: directory,
        });
      sharedLink = sharedLinkResult.result.url;
    } catch (e) {
      if (e.error.error_summary.startsWith("shared_link_already_exists")) {
        sharedLink = e.error.error.shared_link_already_exists.metadata.url;
      } else if (e.error.error_summary.startsWith("path/not_found")) {
        // Create the directory
        try {
          await this.#dropbox.filesCreateFolderV2({
            path: directory,
          });
        } catch (e) {
          if (e.error.error_summary.startsWith("path/conflict")) {
            // The directory was created simultaneously, no problem
          } else {
            throw e;
          }
        }
        // Try again
        return await this.getSharedLink(channel);
      } else {
        throw e;
      }
    }

    if (sharedLink) {
      // Cache the shared link
      await set(channel, sharedLink, this.#sharedLinkCache);
      return sharedLink;
    } else {
      throw "Shared link could not be created";
    }
  }

  async post(
    channel: string,
    data: Uint8Array,
    uuid?: Uint8Array,
  ): Promise<string> {
    this.#checkIfLoggedIn();

    // Generate a random UUID if one is not provided
    uuid = uuid || randomBytes(16);

    // Base64 encode the UUID to use as a file name
    const uuidString = this.#base64Encode(uuid);

    // Encryt the data with the channel as key
    const encrypted = this.#encrypt(channel, data);

    // Make sure the directory exists
    const sharedLink = await this.getSharedLink(channel);

    // Upload the file to the directory
    const directory = this.#channelToDirectory(channel);
    await this.#dropbox.filesUpload({
      path: `${directory}/${uuidString}`,
      contents: encrypted,
      mode: {
        ".tag": "overwrite",
      },
    });

    return sharedLink;
  }

  async *watch(
    channel: string,
    sharedLink: string,
    signal?: AbortSignal,
  ): AsyncGenerator<Uint8Array> {
    this.#checkIfLoggedIn();

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
            let binary: Uint8Array;
            if (
              "fileBinary" in file.result &&
              file.result.fileBinary instanceof Uint8Array
            ) {
              binary = file.result.fileBinary;
            } else if (
              "fileBlob" in file.result &&
              file.result.fileBlob instanceof Blob
            ) {
              binary = new Uint8Array(await file.result.fileBlob.arrayBuffer());
            } else {
              throw "Unexpected file type returned from Dropbox API.";
            }
            yield this.#decrypt(channel, binary);
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
