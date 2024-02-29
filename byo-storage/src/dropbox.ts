import { Dropbox } from "dropbox";
import { base64Encode } from "./util";
import { randomBytes } from "@noble/hashes/utils";
import type { files, sharing } from "dropbox";

const ROOT_FOLDER = "/byo-storage";

export type Authentication =
  | {
      clientId: string;
      accessToken?: string;
    }
  | {
      accessToken: string;
    };

export type FileListResult =
  | {
      type: "update";
      data: Uint8Array;
      name: string;
    }
  | {
      type: "delete";
      name: string;
    }
  | {
      type: "cursor";
      cursor: string;
    }
  | {
      type: "backlog-complete";
    };

export default class DropboxSimplified {
  #dropbox: Dropbox;

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
      // We are in the middle of an OAuth flow
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
  }

  get loggedIn() {
    return !!this.#dropbox.auth.getAccessToken();
  }

  checkIfLoggedIn() {
    if (!this.loggedIn) {
      throw "You are not logged in to dropbox";
    }
  }

  async toggleLogIn() {
    if (!this.loggedIn) {
      const myURL = new URL(window.location.href);
      myURL.search = "";

      // Generate a random state string to prevent CSRF attacks
      const stateBytes = randomBytes(16);
      const state = base64Encode(stateBytes);
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

  async updateFile(
    directory: string,
    name: string,
    data: Uint8Array,
  ): Promise<void> {
    await this.#dropbox.filesUpload({
      path: `${ROOT_FOLDER}/${directory}/${name}`,
      contents: data,
      mode: {
        ".tag": "overwrite",
      },
    });
  }

  async deleteFile(directory: string, name: string): Promise<void> {
    this.checkIfLoggedIn();
    await this.#dropbox.filesDeleteV2({
      path: `${ROOT_FOLDER}/${directory}/${name}`,
    });
  }

  async downloadFile(sharedLink: string, name: string): Promise<Uint8Array> {
    let result:
      | sharing.FileLinkMetadataReference
      | sharing.FolderLinkMetadataReference
      | sharing.SharedLinkMetadataReference;
    try {
      const out = await this.#dropbox.sharingGetSharedLinkFile({
        url: sharedLink,
        path: `/${name}`,
      });
      result = out.result;
    } catch (e) {
      if (
        e.error.error_summary.startsWith("shared_link_not_found") ||
        e.error.error_summary.startsWith("shared_link_access_denied")
      ) {
        throw "File not found";
      } else {
        throw e;
      }
    }

    if ("fileBinary" in result && result.fileBinary instanceof Uint8Array) {
      return result.fileBinary;
    } else if ("fileBlob" in result && result.fileBlob instanceof Blob) {
      return new Uint8Array(await result.fileBlob.arrayBuffer());
    } else {
      throw "Unexpected file type returned from Dropbox API.";
    }
  }

  directoryToPath(directory: string): string {
    return `${ROOT_FOLDER}/${directory}`;
  }

  async createDirectory(directory: string): Promise<string> {
    // Get the shared link to the channel
    try {
      // See if the shared link already exists on dropbox
      const sharedLinkResult =
        await this.#dropbox.sharingCreateSharedLinkWithSettings({
          path: this.directoryToPath(directory),
        });
      return sharedLinkResult.result.url;
    } catch (e) {
      if (e.error.error_summary.startsWith("shared_link_already_exists")) {
        return e.error.error.shared_link_already_exists.metadata.url;
      } else if (e.error.error_summary.startsWith("path/not_found")) {
        // Create the directory
        try {
          await this.#dropbox.filesCreateFolderV2({
            path: this.directoryToPath(directory),
          });
        } catch (e) {
          if (e.error.error_summary.startsWith("path/conflict")) {
            // The directory was created simultaneously, no problem
          } else {
            throw e;
          }
        }
        // Try again
        return await this.createDirectory(directory);
      } else {
        throw e;
      }
    }
  }

  async *listFiles(
    sharedLink: string,
    options?: {
      cursor?: string;
      signal?: AbortSignal;
    },
  ): AsyncGenerator<FileListResult, never, void> {
    this.checkIfLoggedIn();

    let backlogComplete = false;
    let cursor: string;
    let hasMore: boolean;
    let entries: (
      | files.FileMetadataReference
      | files.FolderMetadataReference
      | files.DeletedMetadataReference
    )[];

    const optionsCursor = options?.cursor;
    if (!optionsCursor) {
      // Start the process
      const { result: initialResult } = await this.#dropbox.filesListFolder({
        path: "",
        shared_link: {
          url: sharedLink,
        },
      });
      cursor = initialResult.cursor;
      hasMore = initialResult.has_more;
      entries = initialResult.entries;
    } else {
      cursor = optionsCursor;
      entries = [];
      hasMore = true;
    }

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
    options?.signal?.addEventListener(
      "abort",
      () => {
        aborted = true;
        reject(options?.signal?.reason);
      },
      {
        once: true,
        passive: true,
      },
    );

    while (true) {
      if (aborted) {
        throw options?.signal?.reason;
      } else if (entries.length) {
        // Yield the entries if they exist
        for (const entry of entries) {
          if (entry[".tag"] === "file" && entry.is_downloadable) {
            const data = await signalPromise(
              this.downloadFile(sharedLink, entry.name),
            );

            yield {
              type: "update",
              name: entry.name,
              data,
            };
          } else if (entry[".tag"] == "deleted") {
            yield {
              type: "delete",
              name: entry.name,
            };
          }
        }
        entries = [];

        yield {
          type: "cursor",
          cursor,
        };
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
        // If this is the first time starting a long poll,
        // send a signal that the backlog is complete
        if (!backlogComplete) {
          backlogComplete = true;
          yield {
            type: "backlog-complete",
          };
        }

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
}
