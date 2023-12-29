import { ed25519 as curve } from '@noble/curves/ed25519'

// const defaultOrigin = "https://actor.graffiti.garden"
const defaultOrigin = "http://localhost:5173"

interface ReplyMessage {
  messageID: string,
  reply?: string
  error?: string
}

interface ReplyMessageEvent extends Event {
  reply?: ReplyMessage
}

export function base64Encode(bytes: Uint8Array) : string {
  const base64 = btoa(String.fromCodePoint(...bytes))
  // Make sure it is url safe
  return base64.replace(/\+/g, '-')
               .replace(/\//g, '_')
}

export function base64Decode(str: string) : Uint8Array {
  const base64 = str.replace(/-/g, '+')
                    .replace(/_/g, '/')
  return new Uint8Array(Array.from(atob(base64), s=> s.codePointAt(0) ?? 0))
}

export default class ActorClient {

  origin: string
  onChosenActor: (actorURI: string|null)=>void
  #messageEvents = new EventTarget()
  #initializeEvents = new EventTarget()
  #initialized = false
  #iframe = document.createElement('iframe')
  #dialog = document.createElement('dialog')

  constructor(onChosenActor: (actorURI: string|null)=>void, origin: string=defaultOrigin) {
    this.onChosenActor = onChosenActor
    this.origin = origin

    window.onmessage = this.#onIframeMessage.bind(this)

    // Bind the iframe to the right origin
    this.#iframe.src = this.origin

    // ... and put it within a dialog
    this.#dialog.className = "graffiti-actor-manager"
    this.#dialog.prepend(this.#iframe)
    document.body.prepend(this.#dialog)

    // Click outside of dialog to close
    this.#dialog.addEventListener('click', e=>{
      const rect = this.#dialog.getBoundingClientRect()
      if (
        rect.top > e.clientY ||
        rect.left > e.clientX ||
        e.clientY > rect.top + rect.height ||
        e.clientX > rect.left + rect.width) {

        this.#dialog.close()
      }
    })
  }

  selectActor() : void {
    this.#dialog.showModal()
  }

  async sign(message: Uint8Array) : Promise<Uint8Array> {
    const reply = await this.#sendAndReceive(
      "sign",
      base64Encode(message)
    )
    return base64Decode(reply)
  }

  async verify(signature: Uint8Array, message: Uint8Array, actorURI: string) {
    const publicKey = base64Decode(actorURI.slice(6))

    // Signature verifies, random bytes do not
    return curve.verify(signature, message, publicKey)
  }

  async noncedSecret(nonce: Uint8Array) : Promise<Uint8Array> {
    const reply = await this.#sendAndReceive(
      "noncedSecret",
      base64Encode(nonce)
    )
    return base64Decode(reply)
  }

  async sharedSecret(theirURI: string) : Promise<Uint8Array> {
    const reply = await this.#sendAndReceive(
      "sharedSecret",
      theirURI
    )
    return base64Decode(reply)
  }

  async #sendAndReceive(action: string, data: string) : Promise<string> {
    // Make sure the iframe is set up
    if (!this.#initialized) {
      await new Promise<void>(resolve => {
        this.#initializeEvents.addEventListener(
          "initialized",
          e=> resolve(),
          { once: true, passive: true }
        )
      })
    }

    // Create a random ID for reply
    if (!this.#iframe.contentWindow) {
      throw "iframe not loaded"
    } else {
      const messageID = crypto.randomUUID()
      this.#iframe.contentWindow.postMessage({
        messageID,
        action,
        data
      }, this.origin)

      // Wait for a reply via events or throw an error
      const reply = await new Promise<ReplyMessage>((resolve, reject) => {
        this.#messageEvents.addEventListener(
          messageID,
          (e: ReplyMessageEvent)=> {
            if (e.reply) {
              resolve(e.reply)
            } else {
              reject("no reply")
            }},
          { once: true, passive: true }
        )
      })

      if (reply.error) {
        throw reply.error
      } else if (reply.reply) {
        return reply.reply
      } else {
        throw "no reply"
      }
    }
  }

  #onIframeMessage({data}) {
    // Initialize on first message
    if (!this.#initialized) {
      this.#initialized = true
      this.#initializeEvents.dispatchEvent(new Event("initialized"))
    }

    // Close whenever canceled or non-null chosen actor
    if (data.canceled || data.chosen) {
      this.#dialog.close()
    }

    if (data.chosen !== undefined) {
      this.onChosenActor(data.chosen)
    } else if (data.messageID) {
      const messageEvent: ReplyMessageEvent = new Event(data.messageID)
      messageEvent.reply = data
      this.#messageEvents.dispatchEvent(messageEvent)
    }
  }
}