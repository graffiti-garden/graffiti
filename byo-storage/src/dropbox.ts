import { Dropbox, DropboxAuth, files, sharing } from "dropbox";
import { base64Encode } from "./util";
import { randomBytes } from "@noble/hashes/utils";

const ROOT_FOLDER = "/byo-storage";

export type Authentication =
  | {
      clientId: string;
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
  #dropboxAuth: DropboxAuth;
  #dropbox: Dropbox;
  #onLoginStateChange?: (loginState: boolean) => void;

  constructor(
    authentication: Authentication,
    onLoginStateChange?: (loginState: boolean) => void,
  ) {
    this.#onLoginStateChange = onLoginStateChange;
    const storedAccessToken =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("byo_storage_dropbox_access_token")
        : null;
    const storedRefreshToken =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("byo_storage_dropbox_refresh_token")
        : null;
    const storedExpiresAt =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("byo_storage_dropbox_expires_at")
        : null;

    this.#dropboxAuth = new DropboxAuth(authentication);
    this.#dropbox = new Dropbox({ auth: this.#dropboxAuth });

    if ("accessToken" in authentication) {
      this.#onLoginStateChange?.(this.loggedIn);
    } else if (storedAccessToken && storedRefreshToken && storedExpiresAt) {
      this.#dropboxAuth.setAccessToken(storedAccessToken);
      this.#dropboxAuth.setRefreshToken(storedRefreshToken);
      this.#dropboxAuth.setAccessTokenExpiresAt(new Date(storedExpiresAt));
      this.#onLoginStateChange?.(this.loggedIn);
    } else if (!!location.search) {
      // We are in the middle of an OAuth flow
      const myURL = new URL(location.href);
      const code = myURL.searchParams.get("code");
      const state = myURL.searchParams.get("state");
      if (code && state) {
        // Clear search params
        myURL.search = "";
        history.replaceState(null, "", myURL.pathname);

        // Recover stored state and code
        const storedState = sessionStorage.getItem(
          "byo_storage_dropbox_auth_state",
        );
        const verifier = sessionStorage.getItem(
          "byo_storage_dropbox_code_verifier",
        );
        sessionStorage.removeItem("byo_storage_dropbox_auth_state");
        sessionStorage.removeItem("byo_storage_dropbox_code_verifier");

        if (verifier && state === storedState) {
          this.#dropboxAuth.setCodeVerifier(verifier);
          this.#dropboxAuth
            .getAccessTokenFromCode(myURL.toString(), code)
            .then(({ result }) => {
              if (
                "access_token" in result &&
                typeof result.access_token == "string" &&
                "refresh_token" in result &&
                typeof result.refresh_token == "string" &&
                "expires_in" in result &&
                typeof result.expires_in == "number"
              ) {
                // Set and store the tokens
                this.#dropboxAuth.setAccessToken(result.access_token);
                this.#dropboxAuth.setRefreshToken(result.refresh_token);
                const expiresAt = new Date(
                  Date.now() + result.expires_in * 1000,
                );
                this.#dropboxAuth.setAccessTokenExpiresAt(expiresAt);
                localStorage.setItem(
                  "byo_storage_dropbox_access_token",
                  result.access_token,
                );
                localStorage.setItem(
                  "byo_storage_dropbox_refresh_token",
                  result.refresh_token,
                );
                localStorage.setItem(
                  "byo_storage_dropbox_expires_at",
                  expiresAt.toISOString(),
                );
                this.#onLoginStateChange?.(this.loggedIn);
              }
            });
        }
      }
    }
  }

  get loggedIn() {
    return !!this.#dropboxAuth.getAccessToken();
  }

  async checkLogIn() {
    if (!this.loggedIn) {
      throw "You are not logged in to dropbox";
    }

    const accessTokenBefore = this.#dropboxAuth.getAccessToken();
    await this.#dropboxAuth.checkAndRefreshAccessToken();
    const accessTokenAfter = this.#dropboxAuth.getAccessToken();

    if (accessTokenBefore !== accessTokenAfter) {
      const expiresAt = this.#dropboxAuth.getAccessTokenExpiresAt();
      localStorage.setItem(
        "byo_storage_dropbox_access_token",
        accessTokenAfter,
      );
      localStorage.setItem(
        "byo_storage_dropbox_expires_at",
        expiresAt.toISOString(),
      );
    }
  }

  async toggleLogIn() {
    if (!this.loggedIn) {
      const myURL = new URL(window.location.href);
      myURL.search = "";

      // Generate a random state string to prevent CSRF attacks
      const stateBytes = randomBytes(16);
      const state = base64Encode(stateBytes);

      // generate a random 10-charachter string
      const authURL = await this.#dropboxAuth.getAuthenticationUrl(
        myURL.toString(),
        state,
        "code",
        "offline",
        undefined,
        undefined,
        true,
      );
      // Store the state in local storage
      const verifier = this.#dropboxAuth.getCodeVerifier();
      sessionStorage.setItem("byo_storage_dropbox_auth_state", state);
      sessionStorage.setItem("byo_storage_dropbox_code_verifier", verifier);

      window.location.href = authURL.toString();
    } else {
      localStorage.removeItem("byo_storage_dropbox_access_token");
      localStorage.removeItem("byo_storage_dropbox_refresh_token");
      localStorage.removeItem("byo_storage_dropbox_expires_at");
      this.#dropboxAuth.setAccessToken("");
      this.#dropboxAuth.setRefreshToken("");
      this.#dropboxAuth.setAccessTokenExpiresAt(new Date(0));
    }
    this.#onLoginStateChange?.(this.loggedIn);
  }

  async updateFile(
    directory: string,
    name: string,
    data: Uint8Array,
  ): Promise<void> {
    await this.checkLogIn();
    await this.#dropbox.filesUpload({
      path: this.directoryToPath(`${directory}/${name}`),
      contents: data,
      mode: {
        ".tag": "overwrite",
      },
    });
  }

  async deleteFile(directory: string, name: string): Promise<void> {
    await this.checkLogIn();
    await this.#dropbox.filesDeleteV2({
      path: this.directoryToPath(`${directory}/${name}`),
    });
  }

  async deleteDirectory(directory: string): Promise<void> {
    await this.checkLogIn();
    console.log(this.directoryToPath(directory));
    await this.#dropbox.filesDeleteV2({
      path: this.directoryToPath(directory),
    });
  }

  async downloadFile(sharedLink: string, name: string): Promise<Uint8Array> {
    await this.checkLogIn();
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
    await this.checkLogIn();
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
    await this.checkLogIn();

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
      let initialResult: files.ListFolderResult;
      try {
        const out = await this.#dropbox.filesListFolder({
          path: "",
          shared_link: {
            url: sharedLink,
          },
        });
        initialResult = out.result;
      } catch (e) {
        if (e.error.error_summary.startsWith("path/not_found")) {
          throw "Path not found";
        } else {
          throw e;
        }
      }
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
    options?.signal?.addEventListener(
      "abort",
      () => {
        reject(options?.signal?.reason);
      },
      {
        once: true,
        passive: true,
      },
    );

    while (true) {
      if (options?.signal?.aborted) {
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
