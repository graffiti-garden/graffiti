import { sha256Hex } from './src/util.js'
import Tracker from './src/tracker-single.js'

export default class TrackerClient {

  constructor(peerProof, ...serverURLs) {
    this.peerProof = peerProof
    this.announces = new EventTarget()

    this.trackers = serverURLs.map(url=>
        new Tracker(
          peerProof,
          url,
          this.#onUpdate.bind(this)))

    this.openSubscriptions = new Set()
  }

  async *subscribe(uri, signal) {

    if (this.openSubscriptions.has(uri))
      throw "You are already subscribed to that URI"
    this.openSubscriptions.add(uri)
    const infoHash = await sha256Hex(uri)
    this.#request('subscribe', infoHash)

    try {
      while (true) {
        yield await new Promise((resolve, reject)=> {
          const retreive = e=> {
            signal?.removeEventListener("abort", abort)
            resolve(e.message)
          }
          const abort = e=> {
            this.announces.removeEventListener(infoHash, retreive)
            reject(signal.reason)
          }
          this.announces.addEventListener(
            infoHash,
            retreive,
            { once: true, passive: true })
          signal?.addEventListener(
            "abort",
            abort,
            { once: true, passive: true })
        })
      }
    } finally {
      this.#request('unsubscribe', infoHash)
      this.openSubscriptions.delete(uri)
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
    const outputs = (await Promise.allSettled(
      this.trackers.map(t=>
        t.request(action, ...infoHashes))))
    if (outputs.every(o=> o.status=='rejected')) {
      throw "not connected to any tracker"
    } else {
      return outputs.map(o=>
         o.status=='fulfilled'? o.value : "error: " + o.reason)
    }
  }

  async #announceAction(action, ...uris) {
    const infoHashes = await Promise.all(uris.map(u=> sha256Hex(u)))
    return await this.#request(action, ...infoHashes)
  }
}