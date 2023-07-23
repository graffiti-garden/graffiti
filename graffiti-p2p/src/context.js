import { sha256Hex } from "./util"
import * as jose from 'jose'
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
    this.me = options.actor
    this.wrapper = options.wrapper
    this._objects = options.objectConstructor()
  }

  async onAnnounce(peer) {
    if (!this.peers.has(peer)) {
      this.peers.add(peer)
      Object.values(this._objects).forEach(
        o=>this.wire.send(peer, o.jwt))
    }
  }

  async onUnannounce(peer) {
    this.peers.delete(peer)
  }

  async onMessage(peer, jwt) {
    await this.onAnnounce(peer)
    const { payload, protectedHeader } =
      await jose.jwtVerify(jwt, jose.EmbeddedJWK)
    const actor = await jose.calculateJwkThumbprint(protectedHeader.jwk)

    if (payload.context != this.contextPath) return

    const hashURI = GraffitiObject.toURI(actor, payload.hash)
    if (hashURI in this._objects &&
        payload.updated <= this._objects[hashURI].updated) return
    if (payload.path &&
        payload.hash != await sha256Hex(payload.path)) return

    await this.#store(hashURI, payload.path, actor, payload.updated, jwt)
  }

  async add(object, remove=false) {
    if (this.me.id != object.actor)
      throw "Can't add an object to the context that isn't yours!"

    const updated = Date.now()

    const hash = await sha256Hex(object.path)
    const hashURI = GraffitiObject.toURI(object.actor, hash)

    const path = remove? null : object.path

    const jwt = await this.me.signMessage({
      hash,
      path,
      updated,
      context: this.contextPath
    })
    await this.#store(hashURI, path, object.actor, updated, jwt)
  }

  async #store(hashURI, path, actor, updated, jwt) {
    this._objects[hashURI] = {
      path,
      actor,
      updated,
      jwt
    }
    await this.gossip([...this.peers], jwt)
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