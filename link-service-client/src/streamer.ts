import { randomBytes, concatBytes } from "@noble/hashes/utils"
import { sha256 } from "@noble/hashes/sha256"
import { ed25519 as curve } from '@noble/curves/ed25519'
import { INFO_HASH_PREFIX, STREAM_REQUEST_CODES, STREAM_RESPONSE_HEADERS, STREAM_VERSION, STREAM_RECONNECT_TIMEOUT } from "./constants"
let ws: any

const decoder = new TextDecoder()

export enum AnnounceType {
  ANNOUNCE = 'announce',
  UNANNOUNCE = 'unannounce',
  BACKLOG_COMPLETE = 'backlog-complete'
}
interface ErrorEvent extends Event {
  error?: string
}
interface AnnounceValue {
  type: AnnounceType,
  publicKey?: Uint8Array,
  containerSigned?: Uint8Array
}
interface AnnounceEvent extends Event {
  value?: AnnounceValue
}

export default class LinkStreamer {
  #serviceSocket: string
  #subscriptions: { [key: string]: Uint8Array } = {}
  open: boolean = false
  #connectionEvents = new EventTarget()
  #replyEvents      = new EventTarget()
  #announceEvents   = new EventTarget()
  #ws: any

  constructor(serviceSocket: string) {
    this.#serviceSocket = serviceSocket
    this.#connect()
  }

  async #connect() : Promise<void> {
    if (!ws) {
      ws = (typeof WebSocket === 'undefined') ? (await import('ws')).default  : WebSocket
    }
    this.#ws = new ws(this.#serviceSocket)
    this.#ws.binaryType = "arraybuffer"
    this.#ws.onopen    = this.#onOpen.bind(this)
    this.#ws.onmessage = this.#onMessage.bind(this)
    this.#ws.onclose   = this.#onClose.bind(this)
  }

  #onOpen() : void {
    this.open = true
    this.#connectionEvents.dispatchEvent(new Event("open"))

    // Send all the subscriptions!
    if (Object.keys(this.#subscriptions).length) {
      this.request(true, ...Object.values(this.#subscriptions))
    }
  }

  async tilOpen() : Promise<void> {
    if (!this.open) {
      await new Promise<void>(resolve=> 
        this.#connectionEvents.addEventListener(
          'open',
          ()=> resolve(),
          { once: true, passive: true }
        )
      )
    }
  }

  async request(subscribe: boolean, ...infoHashes: Array<Uint8Array>) : Promise<void> {
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
    const replyPromise = new Promise<void>((resolve, reject)=> {
      const onMessage = (e: ErrorEvent)=> {
        this.#connectionEvents.removeEventListener(
          'close',
          onClose
        )

        // Reject or resolve
        e.error? reject(e.error) : resolve()
      }
      const onClose = ()=> {
        this.#replyEvents.removeEventListener(
          messageIDString,
          onMessage as EventListener
        )

        // Resolve on close,
        // resubscription will happen
        // in the background
        resolve()
      }

      this.#replyEvents.addEventListener(
        messageIDString,
        onMessage as EventListener,
        { once: true, passive: true }
      )
      this.#connectionEvents.addEventListener(
        'close',
        onClose,
        { once: true, passive: true }
      )
    })

    this.#ws.send(packed.buffer)

    return await replyPromise
  }

  #onMessage({data}: {data: Buffer|ArrayBuffer}) : void {
    const responseHeader = new Uint8Array(data.slice(0,1))[0]

    let isError = false
    switch (responseHeader) {

      case STREAM_RESPONSE_HEADERS.ERROR_WITH_ID:
        isError = true
      case STREAM_RESPONSE_HEADERS.SUCCESS:
        const messageID = data.slice(1, 17)
        const replyEvent: ErrorEvent = new Event(decoder.decode(messageID))
        if (isError) replyEvent.error =
          decoder.decode(data.slice(17))
        this.#replyEvents.dispatchEvent(replyEvent)
        break

      case STREAM_RESPONSE_HEADERS.ANNOUNCE:
        // Make sure the info hash is one
        // we're paying attention to
        const publicKey = new Uint8Array(data.slice(1, 33))
        const infoHashPrev = new Uint8Array(data.slice(33, 33+32))
        const containerSigned = new Uint8Array(data.slice(33+32))
        const infoHash = containerSigned.slice(1, 33)

        // Create and dispatch an event
        if (infoHash.length) {
          const infoHashString = decoder.decode(infoHash)
          const announceEvent: AnnounceEvent = new Event(infoHashString)
          announceEvent.value = {
            type: AnnounceType.ANNOUNCE,
            publicKey: publicKey,
            containerSigned: containerSigned
          }
          this.#announceEvents.dispatchEvent(announceEvent)
        }

        // Check if previous info hash does not match
        if (!infoHash.length || !infoHash.every((v:number,i:number)=> v==infoHashPrev[i])) {
          // Send an updated announcement
          const infoHashPrevString = decoder.decode(infoHashPrev)
          const unannounceEvent: AnnounceEvent = new Event(infoHashPrevString)
          unannounceEvent.value = {
            type: AnnounceType.UNANNOUNCE,
            publicKey: new Uint8Array(publicKey),
          }
          this.#announceEvents.dispatchEvent(unannounceEvent)
        }
        break

      case STREAM_RESPONSE_HEADERS.ERROR_WITHOUT_ID:
        console.error(decoder.decode(data.slice(1)))
        break

      case STREAM_RESPONSE_HEADERS.BACKLOG_COMPLETE:
        const numInfoHashes = (data.byteLength - 1) / 32
        for (let i=0; i < numInfoHashes; i++) {
          const infoHash = data.slice(1 + i * 32, ( i + 1 ) * 32 + 1)
          const infoHashString = decoder.decode(infoHash)

          const backlogCompleteEvent: AnnounceEvent = new Event(infoHashString)
          backlogCompleteEvent.value = {
            type: AnnounceType.BACKLOG_COMPLETE
          }
          this.#announceEvents.dispatchEvent(backlogCompleteEvent)
        }
        break

      default:
        console.error(`Unknown response from connection to ${this.#serviceSocket}`)
    }
  }

  #onClose() : void {
    this.open = false

    this.#connectionEvents.dispatchEvent(new Event("close"))

    console.log(`Lost connection to ${this.#serviceSocket}, reconnecting soon...`)
    setTimeout(this.#connect.bind(this), STREAM_RECONNECT_TIMEOUT)
  }

  async * subscribe(source: string, signal: AbortSignal) : AsyncGenerator<AnnounceValue, never, void> {
    // Make sure the source isn't already subscribed
    if (source in this.#subscriptions)
      throw "already subscribed"

    // Convert to info hash
    const infoHashPrivateKey = sha256(INFO_HASH_PREFIX + source)
    const infoHash = curve.getPublicKey(infoHashPrivateKey)
    const infoHashString = decoder.decode(infoHash)

    // Mark the subscription
    this.#subscriptions[source] = infoHash

    // Create callback functions that
    // reference dynamic resolve and reject.
    // If there is no resolve function,
    // the promise is processing and the
    // output is added to a queue
    let resolve: null|((v: AnnounceValue)=>void) = null
    let reject:  null|((v: string)=>void) = null
    const waitingAnnouncements: Array<AnnounceValue> = []
    const onAnnouncement = (e: AnnounceEvent)=> {
      if (!e.value) return

      if (resolve) {
        resolve(e.value)
        resolve = null
        reject = null
      } else {
        waitingAnnouncements.push(e.value)
      }
    }
    let alreadyRejected = false
    const onAbort = ()=> {
      this.#announceEvents.removeEventListener(
        infoHashString,
        onAnnouncement as EventListener
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
    this.#announceEvents.addEventListener(
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
          const announcement = waitingAnnouncements.shift()
          if (announcement) {
            _resolve(announcement)
          } else {
            resolve = _resolve
          }
        })
      }
    } finally {
      // unsubscribe and free the source
      await this.request(false, infoHash)
      delete this.#subscriptions[source]
    }
  }
}