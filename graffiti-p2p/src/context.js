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
        o=>this.wire.send(peer, o.signed))
    }
  }

  async onUnannounce(peer) {
    this.peers.delete(peer)
  }

  async onMessage(peer, signed) {
    this.onAnnounce(peer)

    // Verify the JWT and the signature
    let unsigned, actor, path
    try {
      ;({ unsigned, actor, path } =
         await verify(signed, this.actorClient, { contextPath: this.contextPath}))
    } catch(e) {
      return
    }

    const hashURI = GraffitiObject.toURI(actor, unsigned.hashPath)
    const { updated } = unsigned

    // Does post already exist?
    if (hashURI in this._posts) {
      if (updated <= this._posts[hashURI].updated ?? 0) return
    }

    // Add it to our own posts
    this._posts[hashURI] = { updated, signed }

    // Seed the object if it exists
    if (path) {
      const object = this.wrapper.get(GraffitiObject, actor, path, this.objectContainer)
      object.onMessage(null, signed)
    }

    // Gossip to peers
    this.gossip([...this.peers], signed)
  }
}