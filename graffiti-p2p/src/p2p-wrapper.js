import PeerMux from "./peer-mux.js"
import TrackerClient from "@graffiti-garden/tracker-client"
import { randomHash, sha256Hex, sha256Uint8 } from "./util"

/**
 * Wraps a class with p2p connectivity.
 * The class must have a particular URI,
 * and messages related to that URI from other
 * peers will be routed to it.
 * 
 * Classes with the same URI are collapsed.
 * 
 * It will call
 * class.toURI(...constructorArgs)
 * class.onMessage(peer, message)
 * class.onAnnounce(peer)
 * 
 * and add the functions
 * class.send(peer, message)
 * class.gossip(message)
 */
export default class P2PWrapper {

  constructor(options={}) {
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

    const wrapped = new Class(...args)
    this.wrapMap[uri] = wrapped
    
    // Keep track of peers
    wrapped.peers = new Set()
    wrapped.onPeer = peer=> {
      if (!wrapped.peers.has(peer)) {
        wrapped.peers.add(peer)
        wrapped.onAnnounce(peer)
      }
    }

    this.workingOnIt.add(uri)

    this.isOpen().then(async ()=> {
      wrapped.infoHash = await sha256Hex(uri)
      const password = await sha256Uint8('key:'+uri)

      wrapped.wire = this.peerMux.createWire(wrapped.infoHash, password, (peer, message)=> {
        wrapped.onPeer(peer)
        wrapped.onMessage(peer, message)
      })

      await this.tracker.announce(wrapped.infoHash)

      this.subscribeKillSwitches[uri] = new AbortController()
      const signal = this.subscribeKillSwitches[uri].signal

      // Subscribe
      ;(async ()=> {
        for await (const {action, peer} of this.tracker.subscribe(wrapped.infoHash, signal)) {
          if (!peer || peer == this.peer) continue

          if (action == 'announce') {
            wrapped.onPeer(peer)
          } else if (action == 'unannounce') {
            wrapped.peers.delete(peer)
          }
        }
      })()

      this.workingOnIt.delete(uri)
      this.events.dispatchEvent(new Event(uri))
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
    wrapped.gossip = async (message)=> {
      await wrapped.isOpen()
      return await wrapped.wire.gossip([...wrapped.peers], message)
    }

    return wrapped
  }

  async delete(Class, ...args) {
    const uri = Class.toURI(...args)

    if (uri in this.wrapMap) {
      const wrapped = this.wrapMap[uri]
      await wrapped.isOpen()
      this.subscribeKillSwitches[uri].abort()
      await wrapped.wire.destroy()
      await this.tracker.unannounce(wrapped.infoHash)
      delete this.wrapMap[uri]
    }
  }
}