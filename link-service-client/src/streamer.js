import { randomBytes, concatBytes } from "@noble/hashes/utils"
import { sha256 } from "@noble/hashes/sha256"
import { ed25519 as curve } from '@noble/curves/ed25519'
import { INFO_HASH_PREFIX, STREAM_REQUEST_CODES, STREAM_RESPONSE_HEADERS, STREAM_VERSION, STREAM_RECONNECT_TIMEOUT } from "./constants"
let ws

const decoder = new TextDecoder()

export default class LinkStreamer {
  constructor(serviceSocket) {
    this.serviceSocket=serviceSocket
    this.open = false
    this.connectionEvents = new EventTarget()
    this.replyEvents      = new EventTarget()
    this.announceEvents   = new EventTarget()
    this.subscriptions      = {}
    this.#connect()
  }

  async #connect() {
    if (!ws) {
      ws = (typeof WebSocket === 'undefined') ? (await import('ws')).default  : WebSocket
    }
    this.ws = new ws(this.serviceSocket)
    this.ws.onopen    = this.#onOpen.bind(this)
    this.ws.onmessage = this.#onMessage.bind(this)
    this.ws.onclose   = this.#onClose.bind(this)
  }

  #onOpen() {
    this.open = true
    this.connectionEvents.dispatchEvent(new Event("open"))

    // Send all the subscriptions!
    if (Object.keys(this.subscriptions).length) {
      this.request(true, ...Object.values(this.subscriptions))
    }
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

  async request(subscribe, ...infoHashes) {
    // If not open, don't hang. It will send on connect.
    if (!this.open) return

    // Generate a random message ID
    const messageID = randomBytes(16)

    // Pack up the message to send
    const packed = concatBytes(
      STREAM_VERSION,
      new Uint8Array([
        STREAM_REQUEST_CODES[subscribe? 'SUBSCRIBE' : 'UNSUBSCRIBE']
      ]),
      messageID,
      ...infoHashes
    )

    // Create a listening promise before sending
    const messageIDString = decoder.decode(messageID)
    const replyPromise = new Promise((resolve, reject)=> {
      const onMessage = e=> {
        this.connectionEvents.removeEventListener(
          'close',
          onClose
        )

        // Reject or resolve
        e.error? reject(e.error) : resolve()
      }
      const onClose = ()=> {
        this.replyEvents.removeEventListener(
          messageIDString,
          onMessage
        )

        // Resolve on close,
        // resubscription will happen
        // in the background
        resolve()
      }

      this.replyEvents.addEventListener(
        messageIDString,
        onMessage,
        { once: true, passive: true }
      )
      this.connectionEvents.addEventListener(
        'close',
        onClose,
        { once: true, passive: true }
      )
    })

    this.ws.send(packed.buffer)

    return await replyPromise
  }

  async #onMessage({data}) {
    const responseHeader = new Uint8Array(data.slice(0,1))[0]

    let isError = false
    switch (responseHeader) {

      case STREAM_RESPONSE_HEADERS.ERROR_WITH_ID:
        isError = true
      case STREAM_RESPONSE_HEADERS.SUCCESS:
        const messageID = data.slice(1, 17)
        const replyEvent = new Event(decoder.decode(messageID))
        if (isError) replyEvent.error =
          decoder.decode(data.slice(17))
        this.replyEvents.dispatchEvent(replyEvent)
        break

      case STREAM_RESPONSE_HEADERS.ANNOUNCE:
        // Make sure the info hash is one
        // we're paying attention to
        const publicKey = data.slice(1, 33)
        const infoHashPrev = data.slice(33, 33+32)
        const containerSigned = data.slice(33+32)
        const infoHash = containerSigned.slice(1, 33)

        // Create and dispatch an event
        if (infoHash.length) {
          const infoHashString = decoder.decode(infoHash)
          const announceEvent = new Event(infoHashString)
          announceEvent.value = {
            type: 'announce',
            publicKey: new Uint8Array(publicKey),
            containerSigned: new Uint8Array(containerSigned)
          }
          this.announceEvents.dispatchEvent(announceEvent)
        }

        // Check if previous info hash does not match
        if (!infoHash.length || !infoHash.every((v,i)=> v==infoHashPrev[i])) {
          // Send an updated announcement
          const infoHashPrevString = decoder.decode(infoHashPrev)
          const unannounceEvent = new Event(infoHashPrevString)
          unannounceEvent.value = {
            type: 'announce',
            publicKey: new Uint16Array(publicKey),
            // No container, just like expiration events
            containerSigned: new Uint8Array()
          }
          this.announceEvents.dispatchEvent(unannounceEvent)
        }
        break

      case STREAM_RESPONSE_HEADERS.ERROR_WITHOUT_ID:
        console.error((await data.text()).slice(1))
        break

      case STREAM_RESPONSE_HEADERS.BACKLOG_COMPLETE:
        const numInfoHashes = (data.length - 1) / 32
        for (let i=0; i < numInfoHashes; i++) {
          const infoHash = data.slice(1 + i * 32, ( i + 1 ) * 32 + 1)
          const infoHashString = decoder.decode(infoHash)

          const backlogCompleteEvent = new Event(infoHashString)
          backlogCompleteEvent.value = {
            type: 'backlog-complete'
          }
          this.announceEvents.dispatchEvent(backlogCompleteEvent)
        }
        break

      default:
        console.error(`Unknown response from connection to ${this.serviceSocket}`)
    }
  }

  #onClose() {
    this.open = false

    this.connectionEvents.dispatchEvent(new Event("close"))

    if (!this.closed) {
      console.log(`Lost connection to ${this.serviceSocket}, reconnecting soon...`)
      setTimeout(this.#connect.bind(this), STREAM_RECONNECT_TIMEOUT)
    }
  }

  async * subscribe(source, signal) {
    // Make sure the sourceis a string
    if (typeof source != 'string')
      throw "source must be a string"

    // Make sure the source isn't already subscribed
    if (source in this.subscriptions)
      throw "already subscribed"

    // Convert to info hash
    const infoHashPrivateKey = sha256(INFO_HASH_PREFIX + source)
    const infoHash = curve.getPublicKey(infoHashPrivateKey)
    const infoHashString = decoder.decode(infoHash)

    // Mark the subscription
    this.subscriptions[source] = infoHash

    // Create callback functions that
    // reference dynamic resolve and reject.
    // If there is no resolve function,
    // the promise is processing and the
    // output is added to a queue
    let resolve, reject
    const waitingAnnouncements = []
    const onAnnouncement = ({value})=> {
      if (resolve) {
        resolve(value)
        resolve = null
        reject = null
      } else {
        waitingAnnouncements.push(value)
      }
    }
    let alreadyRejected = false
    const onAbort = ()=> {
      this.announceEvents.removeEventListener(
        infoHashString,
        onAnnouncement
      )
      if (reject) {
        reject(signal.reason)
        resolve = null
        reject = null
      } else {
        alreadyRejected = signal.reason
      }
    }

    // Add the listeners
    this.announceEvents.addEventListener(
      infoHashString,
      onAnnouncement,
      { passive: true })
    signal?.addEventListener(
      "abort",
      onAbort,
      { once: true, passive: true })

    // Try the request and return announcements
    try {
      await this.request(true, infoHash)

      while(true) {
        if (alreadyRejected) throw alreadyRejected
        yield await new Promise((_resolve, _reject)=> {
          reject = _reject
          if (waitingAnnouncements.length) {
            _resolve(waitingAnnouncements.shift())
          } else {
            resolve = _resolve
          }
        })
      }
    } finally {
      // unsubscribe and free the source
      await this.request(false, infoHash)
      delete this.subscriptions[source]
    }
  }
}