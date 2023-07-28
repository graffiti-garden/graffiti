import { sha256Hex } from "./util"
import GraffitiObject from "./object"

export default class GraffitiContext {
  static toURI(contextPath) {
    return `context:${contextPath}`
  }

  constructor(actorClient, wrapper, contextPath, objectContainer) {
    this.contextPath = contextPath
    this.peers = new Set() 
    this._posts = {}
    this.eventTarget = new EventTarget()
    this.actorClient = actorClient
    this.wrapper = wrapper
    this.objectContainer = objectContainer
  }

  async onAnnounce(peer) {
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
    await this.onAnnounce(peer)
    const { payload, actor } = await this.actorClient.verify(signed)

    if (payload.context != this.contextPath) return

    const hashURI = GraffitiObject.toURI(actor, payload.hash)
    if (hashURI in this._posts &&
        payload.updated <= this._posts[hashURI].updated) return
    if (payload.path &&
        payload.hash != await sha256Hex(payload.path)) return

    await this.#store(hashURI, payload.path, actor, payload.updated, signed)
  }

  async add(object, remove=false) {
    const updated = Date.now()

    const hash = await sha256Hex(object.path)
    const hashURI = GraffitiObject.toURI(object.actor, hash)

    const path = remove? null : object.path

    const signed = await this.actorClient.sign({
      hash,
      path,
      updated,
      context: this.contextPath
    }, object.actor)
    await this.#store(hashURI, path, object.actor, updated, signed)
  }

  async #store(hashURI, path, actor, updated, signed) {
    this._posts[hashURI] = {
      path,
      actor,
      updated,
      signed
    }

    // Send an event
    const updateEvent = new Event("update")
    updateEvent.update = path? {
      action: "add",
      post: this.wrapper.get(GraffitiObject, actor, path, this.objectContainer).value,
      hashURI 
    } : {
      action: "delete",
      hashURI
    }
    this.eventTarget.dispatchEvent(updateEvent)

    await this.gossip([...this.peers], signed)
  }

  async delete(object) {
    return await this.add(object, true)
  }

  async * posts(signal) {
    for (const [hashURI, post] of Object.entries(this._posts).filter(([hashURI, post])=> post.path)) {
      yield {
        action: "add",
        post: this.wrapper.get(GraffitiObject, post.actor, post.path, this.objectContainer).value,
        hashURI
      }
    }

    // Wait for updates
    while (true) {
      yield new Promise((resolve, reject)=> {
        const retreive = e=> {
          signal?.removeEventListener("abort", abort)
          resolve(e.update)
        }
        const abort = ()=> {
          this.eventTarget.removeEventListener("update", retreive)
          reject(signal.reason)
        }
        this.eventTarget.addEventListener(
          "update",
          retreive,
          { once: true, passive: true }
        )
        signal?.addEventListener(
          "abort",
          abort,
          { once: true, passive: true }
        )
      })
    }
  }
}