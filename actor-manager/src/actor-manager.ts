import { sha256 } from "@noble/hashes/sha256";
import { randomBytes, concatBytes, utf8ToBytes } from "@noble/hashes/utils";
import {
  ed25519 as curve,
  edwardsToMontgomeryPub,
  edwardsToMontgomeryPriv,
  x25519,
} from "@noble/curves/ed25519";
import { xchacha20poly1305 as cipher } from "@noble/ciphers/chacha";
import { cookieStore } from "cookie-store";

const oneYearExpirationMS = 365 * 24 * 60 * 60 * 1000;
const oneMonthExpirationMS = 30 * 24 * 60 * 60 * 1000;

async function setCookie(
  name: string,
  value: string,
  shortLived: boolean = false,
): Promise<void> {
  await cookieStore.set({
    name,
    value,
    expires:
      Date.now() + (shortLived ? oneMonthExpirationMS : oneYearExpirationMS),
    domain: null,
    sameSite: "none",
    path: "/; Secure",
  });
}

async function deleteCookie(name: string): Promise<void> {
  await cookieStore.delete({
    name,
    sameSite: "none",
    path: "/; Secure",
  });
}

export interface Actor {
  nickname: string;
  rootSecretBase64: string;
}

export interface ActorAnnouncement extends Event {
  value?:
    | {
        uri: string;
        nickname: string;
      }
    | {
        uri: null;
      };
}

enum Action {
  CHOOSE = "choose",
  UPDATE = "update",
  DELETE = "delete",
}

interface BaseChannelMessage {
  action: Action;
  referrer: string;
  id: string;
}

type ChannelMessage = BaseChannelMessage &
  (
    | {
        uri: string;
        nickname: string;
      }
    | {
        uri: null;
      }
  );

export function base64Encode(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCodePoint(...bytes));
  // Make sure it is url safe
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/\=+$/, "");
}

export function base64Decode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 != 0) {
    base64 += "=";
  }
  return new Uint8Array(Array.from(atob(base64), (s) => s.codePointAt(0) ?? 0));
}

export function actorURIEncode(publicKey: Uint8Array): string {
  return "actor:" + base64Encode(publicKey);
}

export function actorURIDecode(uri: string): Uint8Array {
  return base64Decode(uri.slice(6));
}

const globalReferrer = document.referrer
  ? new URL(document.referrer).origin
  : document.location.origin;

export default class ActorManager {
  isInitialized = false;
  hasStorageAccess = false;

  events: EventTarget;

  channel: BroadcastChannel;
  channelID = crypto.randomUUID();

  referrer: string;

  constructor(events?: EventTarget, referrer: string = globalReferrer) {
    this.events = events ?? new EventTarget();
    this.referrer = referrer;

    // Initialize
    (async () => {
      await new Promise<void>((r) => setTimeout(() => r(), 10));
      if (!document.hasStorageAccess || (await document.hasStorageAccess())) {
        this.hasStorageAccess = true;
        this.events.dispatchEvent(new Event("storageaccess"));
        await this._initialize();
      }
    })();
  }

  async initialize(): Promise<void> {
    // Get cross-origin storage permission
    // if logging in manually (with user activation)
    if (document.requestStorageAccess) {
      try {
        await document.requestStorageAccess();
      } catch (e) {
        console.error(e.toString());
        throw "The actor manager can't work without local storage access!";
      }
    }

    // Set that we have storage access
    this.hasStorageAccess = true;
    this.events.dispatchEvent(new Event("storageaccess"));
    await this._initialize();
  }

  async _initialize(): Promise<void> {
    this.channel = new BroadcastChannel("actors");
    this.channel.onmessage = this.onChannelMessage.bind(this);

    // Load all existing uris
    await Promise.all(
      (await cookieStore.getAll()).map(async (cookie) => {
        const uri = cookie.name;
        if (uri.startsWith("actor")) {
          // Refresh the cookie
          await this.setCookie(uri, cookie.value);

          // Announce the actor
          const actor = JSON.parse(cookie.value);
          await this.announceActor(Action.UPDATE, uri, actor.nickname);
        }
      }),
    );

    // Load the chosen one
    const chosen = await this.getChosen();

    // Make sure it still exists
    if (!chosen) {
      await this.announceActor(Action.CHOOSE, null, "");
    } else {
      let actor: Actor;
      try {
        actor = await this.getActor(chosen);
        // If it does, announce and refresh the cookie
        await this.announceActor(Action.CHOOSE, chosen, actor.nickname);
        await this.setCookie(`chosen:${this.referrer}`, chosen, true);
      } catch {
        await this._unchooseActor();
      }
    }

    this.isInitialized = true;
    this.events.dispatchEvent(new Event("initialized"));
  }

  async chooseActor(uri: string): Promise<void> {
    await this.tilInitialized();
    const actor = await this.getActor(uri);
    await this.setCookie(`chosen:${this.referrer}`, uri, true);
    await this.announceActor(Action.CHOOSE, uri, actor.nickname, true);
  }

  async _unchooseActor(): Promise<void> {
    await this.deleteCookie(`chosen:${this.referrer}`);
    await this.announceActor(Action.CHOOSE, null, "", true);
  }

  async unchooseActor(): Promise<void> {
    await this.tilInitialized();
    await this._unchooseActor();
  }

  async getChosen(): Promise<string | null> {
    return await this.getCookie(`chosen:${this.referrer}`);
  }

  async tilInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await new Promise<void>((resolve) =>
        this.events.addEventListener("initialized", () => resolve(), {
          passive: true,
          once: true,
        }),
      );
    }
  }

  async tilStorageAccess(): Promise<void> {
    if (!this.hasStorageAccess) {
      await new Promise<void>((resolve) =>
        this.events.addEventListener("storageaccess", () => resolve(), {
          passive: true,
          once: true,
        }),
      );
    }
  }

  async setCookie(
    name: string,
    value: string,
    shortLived: boolean = false,
  ): Promise<void> {
    await this.tilStorageAccess();
    await setCookie(name, value, shortLived);
  }

  async getCookie(name: string): Promise<string | null> {
    await this.tilStorageAccess();
    const result = await cookieStore.get(name);
    return result?.value ?? null;
  }

  async deleteCookie(name: string): Promise<void> {
    await this.tilStorageAccess();
    await deleteCookie(name);
  }

  async createActor(nickname: string): Promise<string> {
    await this.tilInitialized();

    // Generate root secret
    const rootSecret = randomBytes(32);

    // Pack it up and store it locally
    const actor: Actor = {
      nickname,
      rootSecretBase64: base64Encode(rootSecret),
    };

    const privateKey = base64Decode(actor.rootSecretBase64);
    const uri = actorURIEncode(curve.getPublicKey(privateKey));

    await this.tilStorageAccess();
    await this.setCookie(uri, JSON.stringify(actor));

    await this.announceActor(Action.UPDATE, uri, actor.nickname, true);

    return uri;
  }

  async getActor(uri: string): Promise<Actor> {
    const actorCookie = await this.getCookie(uri);
    if (!actorCookie) {
      throw `Actor with ID "${uri}" does not exist`;
    } else {
      return JSON.parse(actorCookie);
    }
  }

  async deleteActor(uri: string): Promise<void> {
    await this.tilInitialized();
    const actor = await this.getActor(uri);

    if (
      !confirm(
        `Are you absolutely sure you want to delete the actor "${actor.nickname}". This cannot be undone.`,
      )
    ) {
      throw `User interaction denied deleting actor "${actor.nickname}", ID "${uri}".`;
    }

    // Unchoose if deleting chosen
    if ((await this.getChosen()) == uri) {
      await this.unchooseActor();
    }

    // Remove and announce the change
    await this.deleteCookie(uri);
    await this.announceActor(Action.DELETE, uri, actor.nickname, true);
  }

  async renameActor(uri: string, newNickname: string): Promise<void> {
    await this.tilInitialized();
    const actor = await this.getActor(uri);
    if (actor.nickname != newNickname) {
      actor.nickname = newNickname;
      await this.setCookie(uri, JSON.stringify(actor));
      await this.announceActor(Action.UPDATE, uri, actor.nickname, true);
    }
  }

  async announceActor(
    action: Action,
    uri: string | null,
    nickname: string,
    propogate: boolean = false,
  ): Promise<void> {
    // Announce the event locally
    const actorEvent: ActorAnnouncement = new Event(action);
    if (uri !== null) {
      actorEvent.value = {
        uri,
        nickname,
      };
    } else {
      actorEvent.value = { uri };
    }
    this.events.dispatchEvent(actorEvent);

    if (propogate) {
      await this.tilStorageAccess();

      const baseMessage: BaseChannelMessage = {
        action,
        referrer: this.referrer,
        id: this.channelID,
      };

      const channelMessage: ChannelMessage =
        uri !== null
          ? {
              uri,
              nickname,
              ...baseMessage,
            }
          : {
              uri,
              ...baseMessage,
            };

      this.channel.postMessage(channelMessage);
    }
  }

  async getPrivateKey(nonce?: Uint8Array) {
    const uri = await this.getChosen();
    if (!uri) {
      throw "no actor chosen";
    } else {
      const actor = await this.getActor(uri);
      const rootSecret = base64Decode(actor.rootSecretBase64);

      if (nonce) {
        if (nonce.byteLength < 24) {
          throw "Nonce is too short";
        }
        return sha256(concatBytes(nonce, rootSecret));
      } else {
        return rootSecret;
      }
    }
  }

  async getPublicKey(nonce?: Uint8Array): Promise<Uint8Array> {
    const privateKey = await this.getPrivateKey(nonce);
    return curve.getPublicKey(privateKey);
  }

  async sign(message: Uint8Array, nonce?: Uint8Array): Promise<Uint8Array> {
    const privateKey = await this.getPrivateKey(nonce);
    return curve.sign(message, privateKey);
  }

  async sharedSecret(
    theirPublicKey?: Uint8Array,
    nonce?: Uint8Array,
  ): Promise<Uint8Array> {
    const privateKey = await this.getPrivateKey(nonce);
    if (!theirPublicKey) {
      return privateKey;
    } else {
      const myMontPriv = edwardsToMontgomeryPriv(privateKey);
      const theirMontPub = edwardsToMontgomeryPub(theirPublicKey);
      return x25519.getSharedSecret(myMontPriv, theirMontPub);
    }
  }

  async encryptPrivateMessage(
    plaintext: Uint8Array,
    theirPublicKey?: Uint8Array,
    nonce?: Uint8Array,
  ): Promise<Uint8Array> {
    const sharedSecret = await this.sharedSecret(theirPublicKey, nonce);
    const cipherNonce = randomBytes(24);
    const encrypted = cipher(sharedSecret, cipherNonce).encrypt(plaintext);
    return concatBytes(cipherNonce, encrypted);
  }

  async decryptPrivateMessage(
    ciphertextWithNonce: Uint8Array,
    theirPublicKey?: Uint8Array,
    nonce?: Uint8Array,
  ): Promise<Uint8Array> {
    const sharedSecret = await this.sharedSecret(theirPublicKey, nonce);
    if (ciphertextWithNonce.length < 24) {
      throw "Ciphertext is too short";
    }
    const cipherNonce = ciphertextWithNonce.slice(0, 24);
    const ciphertext = ciphertextWithNonce.slice(24);
    return cipher(sharedSecret, cipherNonce).decrypt(ciphertext);
  }

  async onChannelMessage({ data }: { data: ChannelMessage }): Promise<void> {
    if (data.id != this.channelID) {
      // Don't propogate choose actions for a different referrer
      if (data.action == Action.CHOOSE && data.referrer != this.referrer) {
        return;
      }

      // Add a little delay for localStorage
      // to propogate between tabs
      await new Promise<void>((r) => setTimeout(() => r(), 50));

      // If the deleted is the chosen one,
      // it may not be unchosen across a different refferer
      // so do it now.
      if (
        data.action == Action.DELETE &&
        data.uri == (await this.getChosen())
      ) {
        await this.unchooseActor();
      }

      await this.announceActor(
        data.action,
        data.uri,
        data.uri ? data.nickname : "",
      );
    }
  }
}
