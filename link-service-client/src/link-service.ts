import LinkFactory from "./factory";
import LinkStreamer from "./streamer";
import type { PublicKeyFromNonce, SignFromNonce, CreatedAndExistingLinks, Link } from './factory'
import { AnnounceType } from "./streamer";

export interface AnnounceLink {
  type: AnnounceType,
  link?: Link,
  publicKey?: Uint8Array
}

export default class LinkService {
  #factory: LinkFactory
  #streamer: LinkStreamer

  constructor(serviceURL: string, publicKeyFromNonce: PublicKeyFromNonce, signFromNonce: SignFromNonce) {
    this.#factory  = new LinkFactory(serviceURL, publicKeyFromNonce, signFromNonce)

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
// If the server does not have them (using the backlog-complete signal),
// they are sent to the server. So even if the server clears or is moved,
// there is automatic recovery. "self-healing"

// Also peer-to-peer. Users can manually input links (which they may have
// received from other peers) to circumvent reliance on the server

// Add some sort of resistance to "put" to prevent filling
// up the server with gunk
// - proof of work/stake/space/etc.
//   - do these actually help if clients are on phones vs spammers with mining asics?
// - host data and fetch from server
//   - this would reveal the url, which may be a personal website
// - limited expiration
//   - users regularly "upkeep" links.
//   - could lead to link rot
// - voting / web of trust
//   - do these leak social graph (more than already leaked?)
