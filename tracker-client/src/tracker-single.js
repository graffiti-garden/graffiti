import { sha256Hex } from './util.js'

export const RECONNECT_TIMEOUT = 2000

export default class TrackerSingle {

  constructor(peerProof, trackerURL, onUpdate, onError=e=>console.error(e)) {
    this.peerProof = peerProof
    this.trackerURL = trackerURL
    this.onUpdate = onUpdate
    this.onError = onError

    this.replyEvents = new EventTarget()
    this.connectionEvents = new EventTarget()
    this.open = false
    this.closed = false

    this.announces = new Set()
    this.subscriptions = new Set()
    this.#connect()
  }

  #connect() {
    this.ws = new WebSocket(this.trackerURL)
    this.ws.onopen    = this.#onOpen.bind(this)
    this.ws.onmessage = this.#onMessage.bind(this)
    this.ws.onclose   = this.#onClose.bind(this)
  }

  #onOpen() {
    // Register the peer ID so it can't be forged
    this.ws.send(this.peerProof)
  }

  async tilOpen() {
    if (!this.open) {
      await new Promise(resolve=> 
        this.connectionEvents.addEventListener(
          'open',
          ()=> resolve(),
          { once: true, passive: true }
        )
      )
    }
  }

  async request(action, ...infoHashes) {
    const messageID = await sha256Hex(crypto.randomUUID())

    // Add/remove the announce/subscription
    // to internal database in case we need to reconnect
    if (action == 'announce') {
      infoHashes.forEach(i=> this.announces.add(i))
    } else if (action == 'subscribe') {
      infoHashes.forEach(i=> this.subscriptions.add(i))
    } else if (action == 'unannounce') {
      infoHashes.forEach(i=> this.announces.delete(i))
    } else if (action == 'unsubscribe') {
      infoHashes.forEach(i=> this.subscriptions.delete(i))
    }

    // If not open, don't hang. It will send on connect
    if (!this.open) return 'pending connect'

    // Try sending
    this.ws.send(JSON.stringify({
      messageID, action,
      "info_hashes": infoHashes
    }))

    // Await a reply or close
    return await new Promise((resolve, reject)=> {
      const onMessage = e=> {
        this.connectionEvents.removeEventListener(
          'close',
          onClose
        )

        const message = e.message
        if (message.reply == 'error') {
          reject(message.detail)
        } else {
          resolve(message.reply)
        }
      }
      const onClose = ()=> {
        this.replyEvents.removeEventListener(
          messageID,
          onMessage
        )
        resolve('pending reconnect')
      }

      this.replyEvents.addEventListener(
        messageID,
        onMessage,
        { once: true, passive: true }
      )
      this.connectionEvents.addEventListener(
        'close',
        onClose,
        { once: true, passive: true }
      )
    })
  }

  #onMessage({data}) {
    const message = JSON.parse(data)
    
    if (!this.open) {
      if ('peer_id' in message) {
        this.open = true
        this.connectionEvents.dispatchEvent(new Event("open"))
        console.log(`Established connection to ${this.trackerURL}`)

        // Send all the announces and subscriptions!
        if (this.announces.size)
          this.request("announce", ...this.announces)
        if (this.subscriptions.size)
          this.request("subscribe", ...this.subscriptions)
      } else if ('reply' in message && message['reply'] == 'error') {
        this.onError(message.detail)
      }
    } else if ('reply' in message) {
      if ('messageID' in message) {
        // Route the reply back to it's awaiter
        const replyEvent = new Event(message.messageID)
        replyEvent.message = message
        this.replyEvents.dispatchEvent(replyEvent)
      }
    } else if ('action' in message) {
      this.onUpdate(message)
    }
  }

  async #onClose() {
    this.open = false

    this.connectionEvents.dispatchEvent(new Event("close"))

    if (!this.closed) {
      console.log(`Lost connection to ${this.trackerURL}, reconnecting soon...`)
      setTimeout(this.#connect.bind(this), RECONNECT_TIMEOUT)
    }
  }

  close() {
    this.closed = true
    this.ws.close()
  }
}