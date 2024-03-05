import LinkFactory from "./factory";
import LinkStreamer from "./streamer";
import type {
  PublicKeyFromNonce,
  SignFromNonce,
  CreatedAndExistingLinks,
  Link,
} from "./factory";
import { AnnounceType } from "./streamer";

const defaultServiceURL = "https://link.graffiti.garden";

export type AnnounceLink =
  | {
      type: AnnounceType.ANNOUNCE;
      link: Link;
    }
  | {
      type: AnnounceType.UNANNOUNCE;
      publicKey: Uint8Array;
    }
  | {
      type: AnnounceType.BACKLOG_COMPLETE;
    };

export default class LinkService {
  #factory: LinkFactory;
  #streamer: LinkStreamer;

  constructor(
    publicKeyFromNonce: PublicKeyFromNonce,
    signFromNonce: SignFromNonce,
    serviceURL: string = defaultServiceURL,
  ) {
    this.#factory = new LinkFactory(
      publicKeyFromNonce,
      signFromNonce,
      serviceURL,
    );

    // Convert the to websocket
    const serviceSocket = new URL(serviceURL);
    serviceSocket.protocol = serviceSocket.protocol == "https:" ? "wss" : "ws:";
    this.#streamer = new LinkStreamer(serviceSocket.toString());
  }

  async create(
    source: string,
    target: string,
    expiration: bigint | number,
  ): Promise<CreatedAndExistingLinks> {
    return await this.#factory.create(source, target, expiration);
  }

  async *subscribe(
    source: string,
    signal?: AbortSignal,
  ): AsyncGenerator<AnnounceLink, void, void> {
    for await (const announceValue of this.#streamer.subscribe(
      source,
      signal,
    )) {
      // If it is an announce, parse it
      if (announceValue.type == AnnounceType.ANNOUNCE) {
        yield {
          type: announceValue.type,
          link: this.#factory.parse(
            announceValue.publicKey,
            announceValue.containerSigned,
            source,
          ),
        };
      } else {
        yield announceValue;
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
// - micropayment
//   - some small (dynamic?) cost to upkeep/scale the server
