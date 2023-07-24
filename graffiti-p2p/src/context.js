import { sha256Hex } from "./util"
import GraffitiObject from "./object"

export default class GraffitiContext {
  static toURI(contextPath) {
    return `context:${contextPath}`
  }

  constructor(contextPath, options) {

    this.contextPath = contextPath
    this.peers = new Set() 

    options = {
      objectConstructor: ()=>({}),
      ...options
    }
    this.actorManager = options.actorManager
    this.wrapper = options.wrapper
    this._objects = options.objectConstructor()
  }

  async onAnnounce(peer) {
    if (!this.peers.has(peer)) {
      this.peers.add(peer)
      Object.values(this._objects).forEach(
        o=>this.wire.send(peer, o.signed))
    }
  }

  async onUnannounce(peer) {
    this.peers.delete(peer)
  }

  async onMessage(peer, signed) {
    await this.onAnnounce(peer)
    const { payload, actor } = await this.actorManager.verify(signed)

    if (payload.context != this.contextPath) return

    const hashURI = GraffitiObject.toURI(actor, payload.hash)
    if (hashURI in this._objects &&
        payload.updated <= this._objects[hashURI].updated) return
    if (payload.path &&
        payload.hash != await sha256Hex(payload.path)) return

    await this.#store(hashURI, payload.path, actor, payload.updated, signed)
  }

  async add(object, remove=false) {
    const updated = Date.now()

    const hash = await sha256Hex(object.path)
    const hashURI = GraffitiObject.toURI(object.actor, hash)

    const path = remove? null : object.path

    const signed = await this.actorManager.sign({
      hash,
      path,
      updated,
      context: this.contextPath
    }, object.actor)
    await this.#store(hashURI, path, object.actor, updated, signed)
  }

  async #store(hashURI, path, actor, updated, signed) {
    this._objects[hashURI] = {
      path,
      actor,
      updated,
      signed
    }
    await this.gossip([...this.peers], signed)
  }

  async delete(object) {
    return await this.add(object, true)
  }

  values() {
    return Object.values(this._objects)
      .filter(o=> o.path)
      .map(o=> this.wrapper.get(GraffitiObject, o.actor, o.path).value)
  }
}