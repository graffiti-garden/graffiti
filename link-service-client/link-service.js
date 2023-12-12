import LinkFactory from "./src/factory";
import LinkStreamer from "./src/streamer";

export default class LinkService {
  constructor(serviceURL, nonceToPrivateKey) {
    this.factory  = new LinkFactory(serviceURL, nonceToPrivateKey)

    // Convert the to websocket
    const serviceSocket = new URL(serviceURL)
    serviceSocket.protocol = serviceSocket.protocol == 'https:' ? 'wss' : 'ws:'
    this.streamer = new LinkStreamer(serviceSocket)
  }

  async create(source, target, expiration) {
    return await this.factory.create(source, target, expiration)
  }

  async *subscribe(source, signal) {
    for await (const event of this.streamer.subscribe(source, signal)) {
      if (event.type == 'announce') {
        if (event.containerSigned.length) {
          yield {
            type: 'announce',
            link: this.factory.parse(
              event.publicKey,
              event.containerSigned,
              source
            )
          }
        } else {
          yield {
            type: 'unannounce',
            publicKey: event.publicKey
          }
        }
      } else {
        yield event
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