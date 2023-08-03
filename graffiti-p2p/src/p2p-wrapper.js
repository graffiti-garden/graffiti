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

  constructor(actorClient, options={}) {
    this.actorClient = actorClient
    this.wrapMap = {}
    this.subscribeKillSwitches = {}
    this.workingOnIt = new Set()

    this.open = false
    this.events = new EventTarget()
    this.#initialize(options)
  }

  async #initialize(options) {
    const peerProof = await randomHash()
    this.peer = await sha256Hex(peerProof)
    this.peerMux = new PeerMux(this.peer, options.peerjs)
    this.tracker = new TrackerClient(peerProof, options.trackers)
    this.events.dispatchEvent(new Event("open"))
    this.open = true
  }

  async isOpen() {
    if (!this.open) {
      await new Promise(resolve => {
        this.events.addEventListener(
          "open",
          ()=>resolve(),
          { once: true, passive: true }
        )
      })
    }
  }

  get(Class, ...args) {
    const uri = Class.toURI(...args)
    if (uri in this.wrapMap) return this.wrapMap[uri]

    const wrapped = new Class(this.actorClient, this, ...args)
    this.wrapMap[uri] = wrapped

    this.workingOnIt.add(uri)
    this.isOpen().then(()=> {

      this.peerMux.createWire(uri, wrapped.onMessage?.bind(wrapped)).then(

        async wire=> {
          wrapped.wire = wire
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

          this.workingOnIt.delete(uri)
          this.events.dispatchEvent(new Event(uri))
        }
      )
    })

    wrapped.isOpen = async ()=> {
      if (this.workingOnIt.has(uri)) {
        await new Promise(resolve => {
          this.events.addEventListener(
            uri,
            ()=>resolve(),
            { once: true, passive: true }
          )
        })
      }
    }
    wrapped.send = async (...args)=> {
      await wrapped.isOpen()
      return await wrapped.wire.send(...args)
    }
    wrapped.gossip = async (...args)=> {
      await wrapped.isOpen()
      return await wrapped.wire.gossip(...args)
    }

    return wrapped
  }

  async delete(Class, ...args) {
    const uri = Class.toURI(...args)

    if (uri in this.wrapMap) {
      await this.wrapMap[uri].isOpen()
      this.subscribeKillSwitches[uri].abort()
      await this.wrapMap[uri].wire.destroy()
      await this.tracker.unannounce(uri)
      delete this.wrapMap[uri]
    }
  }
}