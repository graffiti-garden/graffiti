import LinkFactory from "./factory";
import LinkStreamer from "./streamer";
import type { EditorNonceToPrivateKey, CreatedAndExistingLinks, Link } from './factory'
import { AnnounceType } from "./streamer";

const defaultServiceURL = "https://link.graffiti.garden"

export interface AnnounceLink {
  type: AnnounceType,
  link?: Link,
  publicKey?: Uint8Array
}

export default class LinkService {
  #factory: LinkFactory
  #streamer: LinkStreamer

  constructor(nonceToPrivateKey: EditorNonceToPrivateKey, serviceURL: string=defaultServiceURL)  {
    this.#factory  = new LinkFactory(serviceURL, nonceToPrivateKey)

    // Convert the to websocket
    const serviceSocket = new URL(serviceURL)
    serviceSocket.protocol = serviceSocket.protocol == 'https:' ? 'wss' : 'ws:'
    this.#streamer = new LinkStreamer(serviceSocket.toString())
  }

  async create(source: string, target: string, expiration: bigint|number) : Promise<CreatedAndExistingLinks> {
    return await this.#factory.create(source, target, expiration)
  }

  async *subscribe(source: string, signal: AbortSignal) : AsyncGenerator<AnnounceLink, never, void> {
    const iterator = this.#streamer.subscribe(source, signal)
    while (true) {
      const announceValue = (await iterator.next()).value

      // If it is an announce, parse it
      if (announceValue.type == AnnounceType.ANNOUNCE && announceValue.publicKey && announceValue.containerSigned) {
        yield {
          type: announceValue.type,
          link: this.#factory.parse(
            announceValue.publicKey,
            announceValue.containerSigned,
            source
          )
        }
      } else if (announceValue.type != AnnounceType.ANNOUNCE) {
        yield announceValue
      }
    }
  }
}

// TODO:
// Make offline-first: links are stored in local memory.
// If the server does not have them (using the signal mentioned above),
// they are sent to the server. So even if the server clears or is moved,
// there is automatic recovery. "self-healing"

// Add some sort of resistance to "put" to prevent filling
// up the server with gunk
// - proof of work/stake/space/etc.
// - host data and fetch from server
// - voting
// - web of trust