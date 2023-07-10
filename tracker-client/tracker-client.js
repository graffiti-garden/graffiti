import { sha256Hex, websocketURL, subdomainURL } from './src/util.js'
import Tracker from './src/tracker-single.js'

export default class TrackerClient {

  constructor(peerProof, ...serverURLs) {
    this.announces = new EventTarget()

    this.trackers = serverURLs.map(url=>
        new Tracker(
          peerProof,
          websocketURL(subdomainURL('tracker', url)),
          url,
          this.#onUpdate.bind(this)))
  }

  async *subscribe(uri) {
    const infoHash = sha256Hex(uri)
    this.#request('subscribe', infoHash)
    try {
      while (true) {
        const message = await new Promise(resolve=>
          this.announces.addEventListener(
            infoHash,
            e=> resolve(e.message),
            { once: true, passive: true }))
        yield message
      }
    } finally {
      this.#request('unsubscribe', infoHash)
    }
  }

  async announce(...uris) {
    return await this.#announceAction('announce', ...uris)
  }

  async unannounce(...uris) {
    return await this.#announceAction('unannounce', ...uris)
  }

  #onUpdate(message) {
    const e = new Event(message.info_hash)
    delete message.info_hash
    e.message = message
    this.announces.dispatchEvent(e)
  }

  async #request(action, ...infoHashes) {
    return await Promise.all(
      this.trackers.map(t=>
        t.request(action, ...infoHashes)))
  }

  async #announceAction(action, ...uris) {
    const infoHashes = uris.map(u=> sha256Hex(u))
    return await this.#request(action, ...infoHashes)
  }
}