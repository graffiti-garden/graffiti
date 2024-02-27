import { ed25519 as curve } from "@noble/curves/ed25519";
import defaultStyle from "./style.css?inline";

const defaultActorManagerURL = "https://actor.graffiti.garden";
// const defaultActorManagerURL = "http://localhost:5173"

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
  onChosenActor?: (actorURI: string | null) => void;
  actorManagerURL?: string;
  style?: string;
}

export default class ActorManager {
  actorManagerURL: string;
  onChosenActor: ActorManagerOptions["onChosenActor"] | undefined;
  #messageEvents = new EventTarget();
  #initializeEvents = new EventTarget();
  #initialized = false;
  #iframe = document.createElement("iframe");
  #dialog = document.createElement("dialog");

  constructor(options?: ActorManagerOptions) {
    this.onChosenActor = options?.onChosenActor;
    this.actorManagerURL = options?.actorManagerURL ?? defaultActorManagerURL;

    window.onmessage = this.#onIframeMessage.bind(this);

    // Bind the iframe to the right origin
    this.#iframe.src = this.actorManagerURL;

    // ... and put it within a dialog
    this.#dialog.className = "graffiti-actor-manager";
    this.#dialog.prepend(this.#iframe);
    document.body.prepend(this.#dialog);

    // Click outside of dialog to close
    this.#dialog.addEventListener("click", (e) => {
      const rect = this.#dialog.getBoundingClientRect();
      if (
        rect.top > e.clientY ||
        rect.left > e.clientX ||
        e.clientY > rect.top + rect.height ||
        e.clientX > rect.left + rect.width
      ) {
        this.#dialog.close();
      }
    });

    // Inject style
    const style = options?.style ?? defaultStyle;
    if (style.length) {
      const styleEl = document.createElement("style");
      styleEl.textContent = style;
      document.head.append(styleEl);
    }
  }

  selectActor(): void {
    this.#dialog.showModal();
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
    theirURIorPublicKey: string | Uint8Array,
    nonce?: Uint8Array,
  ): Promise<Uint8Array> {
    const theirURIEncoded =
      this.#decodeActorURIorPublicKey(theirURIorPublicKey);
    const output = await this.#sendAndReceive(
      action,
      `${base64Encode(input)},${base64Encode(theirURIEncoded)}`,
      nonce,
    );
    return base64Decode(output);
  }

  async encrypt(
    plaintext: Uint8Array,
    theirURIorPublicKey: string | Uint8Array,
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
    theirURIorPublicKey: string | Uint8Array,
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
    if (data.canceled || data.chosen) {
      this.#dialog.close();
    }

    if (data.chosen !== undefined) {
      this.onChosenActor?.(data.chosen);
    } else if (data.messageID) {
      const messageEvent: ReplyMessageEvent = new Event(data.messageID);
      messageEvent.reply = data;
      this.#messageEvents.dispatchEvent(messageEvent);
    }
  }
}
