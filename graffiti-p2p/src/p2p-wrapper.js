import PeerMux from "./peer-mux.js"
import TrackerClient from "@graffiti-garden/tracker-client"
import { randomHash, sha256Hex } from "./util"

/**
 * Wraps a class with p2p connectivity.
 * 
 * It will call
 * class.toURI
 * class.onMessage
 * class.onUnannounce
 * class.onAnnounce
 */
export default class P2PWrapper {

  constructor(options={}) {
    this.options = options
    this.wrapMap = {}
    this.subscribeKillSwitches = {}
    this.workingOnIt = new Set()

    this.open = false
    this.events = new EventTarget()
    this.#initialize()
  }

  async #initialize() {
    const peerProof = await randomHash()
    this.peer = await sha256Hex(peerProof)
    this.peerMux = new PeerMux(this.peer, this.options.peerjs)
    this.tracker = new TrackerClient(peerProof, ...this.options.trackers)
    this.events.dispatchEvent(new Event("open"))
    this.open = true
  }

  async get(Class, ...args) {
    if (!this.open) {
      await new Promise(resolve => {
        this.events.addEventListener(
          "open",
          ()=>resolve(),
          { once: true, passive: true }
        )
      })
    }

    const uri = Class.toURI(...args)

    if (uri in this.wrapMap) return this.wrapMap[uri]

    const wrapped = new Class(...args, this.options)
    this.wrapMap[uri] = wrapped

    // Wait for stuff to happen if already exists but wire, announce, etc. not finished

    wrapped.wire = await this.peerMux.createWire(uri, wrapped.onMessage?.bind(wrapped))
    await this.tracker.announce(uri)

    this.subscribeKillSwitches[uri] = new AbortController()
    const signal = this.subscribeKillSwitches[uri].signal

    // Subscribe
    ;(async ()=> {
      for await (const {action, peer} of this.tracker.subscribe(uri, signal)) {
        if (peer == this.peer) continue
        if (action == 'announce') {
          wrapped.onAnnounce(peer)
        } else {
          wrapped.onUnannounce(peer)
        }
      }
    })()

    return wrapped
  }


  async delete(Class, ...args) {
    const uri = Class.toURI(...args)

    if (uri in this.wrapMap) {
      this.subscribeKillSwitches[uri].abort()
      await this.wrapMap[uri].wire.destroy()
      await this.tracker.unannounce(uri)
      delete this.wrapMap[uri]
    }
  }
}