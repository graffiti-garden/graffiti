import { sha256Hex } from './src/util.js'
import Tracker from './src/tracker-single.js'

export default class TrackerClient {

  constructor(peerProof, serverURLs) {
    this.peerProof = peerProof
    this.announces = new EventTarget()

    if (!serverURLs || !serverURLs.length)
      serverURLs = ["wss://tracker.graffiti.garden"]

    this.trackers = serverURLs.map(url=>
        new Tracker(
          peerProof,
          url,
          this.#onUpdate.bind(this)))

    this.openSubscriptions = new Set()
  }

  async *subscribe(infoHash, signal) {

    if (this.openSubscriptions.has(infoHash))
      throw "You are already subscribed to that info hash"
    this.openSubscriptions.add(infoHash)
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
      this.openSubscriptions.delete(infoHash)
    }
  }

  async announce(...infoHashes) {
    return await this.#announceAction('announce', ...infoHashes)
  }

  async unannounce(...infoHashes) {
    return await this.#announceAction('unannounce', ...infoHashes)
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

  async #announceAction(action, ...infoHashes) {
    return await this.#request(action, ...infoHashes)
  }
}