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
  uri?: string | null;
}

enum Action {
  CHOOSE = "choose",
  UPDATE = "update",
  DELETE = "delete",
}

interface ChannelMessage {
  action: Action;
  referrer: string;
  uri: string | null;
  id: string;
}

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
          await setCookie(cookie.name, cookie.value);

          await this.announceActor(Action.UPDATE, uri);
        }
      }),
    );
    // Load the chosen one
    const chosen = await this.getChosen();

    // Make sure it still exists
    if (chosen && !(await cookieStore.get(chosen))) {
      // If not delete, and propogate
      this.unchooseActor();
    } else {
      await this.announceActor(Action.CHOOSE, chosen);
      // Otherwise, refresh it
      if (chosen) {
        await setCookie(`chosen:${this.referrer}`, chosen, true);
      }
    }

    this.isInitialized = true;
    this.events.dispatchEvent(new Event("initialized"));
  }

  async chooseActor(uri: string): Promise<void> {
    await setCookie(`chosen:${this.referrer}`, uri, true);
    await this.announceActor(Action.CHOOSE, uri, true);
  }

  async unchooseActor(): Promise<void> {
    await deleteCookie(`chosen:${this.referrer}`);
    await this.announceActor(Action.CHOOSE, null, true);
  }

  async getChosen(): Promise<string | null> {
    const result = await cookieStore.get(`chosen:${this.referrer}`);
    return result?.value ?? null;
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

  async createActor(nickname: string): Promise<string> {
    // Generate root secret
    const rootSecret = randomBytes(32);

    // Pack it up and store it locally
    const actor: Actor = {
      nickname,
      rootSecretBase64: base64Encode(rootSecret),
    };
    return this.storeActor(actor);
  }

  async storeActor(actor: Actor): Promise<string> {
    const privateKey = base64Decode(actor.rootSecretBase64);
    const uri = actorURIEncode(curve.getPublicKey(privateKey));

    await this.tilInitialized();
    await setCookie(uri, JSON.stringify(actor));

    await this.announceActor(Action.UPDATE, uri, true);

    return uri;
  }

  async getActor(uri: string): Promise<Actor> {
    await this.tilInitialized();
    const actorCookie = await cookieStore.get(uri);
    if (!actorCookie) {
      throw `Actor with ID "${uri}" does not exist`;
    } else {
      return JSON.parse(actorCookie.value);
    }
  }

  async deleteActor(uri: string): Promise<void> {
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
    await deleteCookie(uri);
    await this.announceActor(Action.DELETE, uri, true);
  }

  async renameActor(uri: string, newNickname: string): Promise<void> {
    const actor = await this.getActor(uri);
    if (actor.nickname != newNickname) {
      actor.nickname = newNickname;
      await setCookie(uri, JSON.stringify(actor));
      await this.announceActor(Action.UPDATE, uri, true);
    }
  }

  async announceActor(
    action: Action,
    uri: string | null,
    propogate: boolean = false,
  ): Promise<void> {
    // Announce the event locally
    const actorEvent: ActorAnnouncement = new Event(action);
    actorEvent.uri = uri;
    this.events.dispatchEvent(actorEvent);

    if (propogate) {
      await this.tilInitialized();

      const channelMessage: ChannelMessage = {
        action,
        uri,
        referrer: this.referrer,
        id: this.channelID,
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

      await this.announceActor(data.action, data.uri);
    }
  }
}
