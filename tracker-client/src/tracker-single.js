import { sha256Hex } from './util.js'

export default class TrackerSingle {

  constructor(peerProof, trackerURL, onUpdate) {
    this.peerProof = peerProof
    this.trackerURL = trackerURL
    this.onUpdate = onUpdate

    this.replyEvents = new EventTarget()
    this.openEvent   = new EventTarget()
    this.open = false
    this.#connect()
  }

  #connect() {
    this.opening = true
    this.ws = new WebSocket(this.trackerURL)
    this.ws.onopen    = this.#onOpen.bind(this)
    this.ws.onmessage = this.#onMessage.bind(this)
    this.ws.onclose   = this.#onClose.bind(this)
  }

  #onOpen() {
    // Register the peer ID so it can't be forged
    this.ws.send(this.peerProof)
  }

  async request(action, ...infoHashes) {
    const messageID = await sha256Hex(crypto.randomUUID())

    // Wait to open
    if (!this.open) {
      if (!this.opening) this.#connect()
      await new Promise(resolve =>
        this.openEvent.addEventListener(
          'open',
          ()=> resolve(),
          { once: true, passive: true }))
    }

    this.ws.send(JSON.stringify({
      messageID, action,
      "info_hashes": infoHashes
    }))

    // Await a reply
    const message = await new Promise(resolve =>
      this.replyEvents.addEventListener(
        messageID,
        e=> resolve(e.message),
        { once: true, passive: true }))

    if (message.reply == 'error') {
      throw message.detail
    } else {
      return message.reply
    }
  }

  #onMessage({data}) {
    const message = JSON.parse(data)

    if ('reply' in message) {
      if ('messageID' in message) {
        // Route the reply back to it's awaiter
        const replyEvent = new Event(message.messageID)
        replyEvent.message = message
        this.replyEvents.dispatchEvent(replyEvent)
      } else {
        throw message
      }
    } else if (!this.open && 'peer_id' in message) {
      // This must be the first message
      this.open = true
      this.opening = false
      this.openEvent.dispatchEvent(new Event("open"))
    } else if ('action' in message) {
      this.onUpdate(message)
    }
  }

  async #onClose() {
    this.open = false
  }

  close() {
    this.ws.close()
  }
}