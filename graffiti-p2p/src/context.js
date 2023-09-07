import { sign, verify } from './crypto'
import { sha256Hex } from './util'
import GraffitiObject from "./object"

export default class GraffitiContext {
  static toURI(contextPath) {
    return `context:${contextPath}`
  }

  constructor(actorClient, wrapper, contextPath, objectContainer) {
    this.contextPath = contextPath
    this.peers = new Set() 
    this._posts = {}
    this.actorClient = actorClient
    this.wrapper = wrapper
    this.objectContainer = objectContainer
  }

  async onAnnounce(peer) {
    if (!peer) return
    if (!this.peers.has(peer)) {
      this.peers.add(peer)
      Object.values(this._posts).forEach(
        o=>this.send(peer, o.signed))
    }
  }

  async onUnannounce(peer) {
    this.peers.delete(peer)
  }

  async onMessage(peer, signed) {
    this.onAnnounce(peer)

    // Verify the JWT and the signature
    let verified
    try {
      verified = await verify(signed, this.actorClient, { contextPath: this.contextPath})
    } catch(e) {
      return
    }

    this.onVerified(verified, signed)
  }

  onVerified(verified, signed) {
    const {unsigned, actor, path, value} = verified

    // Is our context relevant?
    if (!value.context || !value.context.includes(this.contextPath)) return

    const hashURI = GraffitiObject.toURI(actor, unsigned.hashPath)
    const { updated } = unsigned

    // Does post already exist?
    if (hashURI in this._posts) {
      if (updated <= this._posts[hashURI].updated ?? 0) return
    }

    // Add it to our own posts
    this._posts[hashURI] = { updated, signed }

    // Seed the object
    if (path) {
      const object = this.wrapper.get(GraffitiObject, actor, path, this.objectContainer)
      object.onVerified(verified, signed)
    }

    // Gossip to peers
    this.gossip([...this.peers], signed)
  }
}