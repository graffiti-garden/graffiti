import { ed25519 as curve } from "@noble/curves/ed25519";

const defaultActorManagerURL = "https://actor.graffiti.garden";
// const defaultActorManagerURL = "http://localhost:5173";

interface ReplyMessage {
  messageID: string;
  reply?: string;
  error?: string;
}

interface ReplyMessageEvent extends Event {
  reply?: ReplyMessage;
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

export interface ActorManagerOptions {
  onChosenActor?: (
    actor:
      | {
          uri: string;
          nickname: string;
        }
      | {
          uri: null;
        },
  ) => void;
  onUICancel?: () => void;
  actorManagerURL?: string;
  style?: string;
}

export default class ActorManager {
  actorManagerURL: string;
  #onChosenActor: ActorManagerOptions["onChosenActor"] | undefined;
  #onUICancel: ActorManagerOptions["onUICancel"] | undefined;
  #messageEvents = new EventTarget();
  #initializeEvents = new EventTarget();
  #initialized = false;
  #iframe = document.createElement("iframe");
  #chosenActor: string | null = null;

  constructor(options?: ActorManagerOptions) {
    this.actorManagerURL = options?.actorManagerURL ?? defaultActorManagerURL;
    this.#onChosenActor = options?.onChosenActor;
    this.#onUICancel = options?.onUICancel;

    window.addEventListener("message", (event) => {
      this.#onIframeMessage(event);
    });

    // Bind the iframe to the right origin
    this.#iframe.src = this.actorManagerURL;
  }

  get iframe() {
    return this.#iframe;
  }

  get chosenActor(): string | null {
    return this.#chosenActor;
  }

  get chosenActorPublicKey(): Uint8Array | null {
    return this.#chosenActor ? base64Decode(this.#chosenActor.slice(6)) : null;
  }

  async sign(message: Uint8Array, nonce?: Uint8Array): Promise<Uint8Array> {
    const reply = await this.#sendAndReceive(
      "sign",
      base64Encode(message),
      nonce,
    );
    return base64Decode(reply);
  }

  #decodeActorURIorPublicKey(actorURIorPublicKey: string | Uint8Array) {
    let publicKey: Uint8Array;
    if (typeof actorURIorPublicKey == "string") {
      if (actorURIorPublicKey.startsWith("actor:")) {
        actorURIorPublicKey = actorURIorPublicKey.slice(6);
      }
      publicKey = base64Decode(actorURIorPublicKey);
    } else {
      publicKey = actorURIorPublicKey;
    }
    return publicKey;
  }

  async verify(
    signature: Uint8Array,
    message: Uint8Array,
    actorURIorPublicKey: string | Uint8Array,
  ) {
    const publicKey = this.#decodeActorURIorPublicKey(actorURIorPublicKey);
    // Signature verifies, random bytes do not
    return curve.verify(signature, message, publicKey);
  }

  async getPublicKey(nonce?: Uint8Array): Promise<Uint8Array> {
    const pkString = await this.#sendAndReceive("public-key", "", nonce);
    return base64Decode(pkString);
  }

  async #privateMessageAction(
    action: string,
    input: Uint8Array,
    theirURIorPublicKey?: string | Uint8Array,
    nonce?: Uint8Array,
  ): Promise<Uint8Array> {
    let dataString = base64Encode(input);
    if (theirURIorPublicKey !== undefined) {
      const theirURIEncoded =
        this.#decodeActorURIorPublicKey(theirURIorPublicKey);
      dataString += `,${base64Encode(theirURIEncoded)}`;
    }
    const output = await this.#sendAndReceive(action, dataString, nonce);
    return base64Decode(output);
  }

  async encrypt(
    plaintext: Uint8Array,
    theirURIorPublicKey?: string | Uint8Array,
    nonce?: Uint8Array,
  ): Promise<Uint8Array> {
    return await this.#privateMessageAction(
      "encrypt",
      plaintext,
      theirURIorPublicKey,
      nonce,
    );
  }

  async decrypt(
    ciphertext: Uint8Array,
    theirURIorPublicKey?: string | Uint8Array,
    nonce?: Uint8Array,
  ): Promise<Uint8Array> {
    return await this.#privateMessageAction(
      "decrypt",
      ciphertext,
      theirURIorPublicKey,
      nonce,
    );
  }

  async #sendAndReceive(
    action: string,
    data: string,
    nonce?: Uint8Array,
  ): Promise<string> {
    // Make sure the iframe is set up
    if (!this.#initialized) {
      await new Promise<void>((resolve) => {
        this.#initializeEvents.addEventListener(
          "initialized",
          (e) => resolve(),
          { once: true, passive: true },
        );
      });
    }

    // Create a random ID for reply
    if (!this.#iframe.contentWindow) {
      throw "iframe not loaded";
    } else {
      const messageID = crypto.randomUUID();
      this.#iframe.contentWindow.postMessage(
        {
          messageID,
          action,
          data,
          nonce: nonce ? base64Encode(nonce) : nonce,
        },
        this.actorManagerURL,
      );

      // Wait for a reply via events or throw an error
      const reply = await new Promise<ReplyMessage>((resolve, reject) => {
        this.#messageEvents.addEventListener(
          messageID,
          (e: ReplyMessageEvent) => {
            if (e.reply) {
              resolve(e.reply);
            } else {
              reject("no reply");
            }
          },
          { once: true, passive: true },
        );
      });

      if (reply.error) {
        throw reply.error;
      } else if (reply.reply) {
        return reply.reply;
      } else {
        throw "no reply";
      }
    }
  }

  #onIframeMessage({ data }) {
    // Initialize on first message
    if (!this.#initialized) {
      this.#initialized = true;
      this.#initializeEvents.dispatchEvent(new Event("initialized"));
    }

    // Close whenever canceled or non-null chosen actor
    if (data.canceled) {
      this.#onUICancel?.();
    }

    if ("chosen" in data) {
      this.#chosenActor = data.chosen.uri;
      this.#onChosenActor?.(data.chosen);
    } else if (data.messageID) {
      const messageEvent: ReplyMessageEvent = new Event(data.messageID);
      messageEvent.reply = data;
      this.#messageEvents.dispatchEvent(messageEvent);
    }
  }
}
