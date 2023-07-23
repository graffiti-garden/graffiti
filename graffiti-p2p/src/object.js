import * as jose from 'jose'

export default class GraffitiObject {

  static toURI(actor, path) {
    if(typeof actor === "undefined")
      throw "Actor is not defined"
    return `object:${actor}:${path}`
  }

  constructor(actor, path, options) {
    this.jwt = null
    this.actor = actor
    this.path = path
    this.updated = 0

    options = {
      objectConstructor: ()=>({}),
      ...options
    }

    this.me = options.actor

    this._value = options.objectConstructor()
    Object.defineProperty(this._value, '__graffiti', { value: true })
    Object.defineProperty(this._value, 'id', {value: this.constructor.toURI(actor, path)})
    Object.defineProperty(this._value, 'actor', {value: actor})
    Object.defineProperty(this._value, 'path', {value: path})

    this.peers = new Set() 
  }

  async onMessage(peer, jwt) {
    await this.onAnnounce(peer)

    const { payload, protectedHeader } =
      await jose.jwtVerify(jwt, jose.EmbeddedJWK)
    const actor = await jose.calculateJwkThumbprint(protectedHeader.jwk)

    if (payload.updated <= this.updated) return
    if (actor != this.actor) return
    if (payload.path != this.path) return
    if (!(payload.value instanceof Object)) return

    this.#store(payload.value, payload.updated, jwt)
  }

  async onAnnounce(peer) {
    if (!this.peers.has(peer)) {
      this.peers.add(peer)
      if (this.jwt) {
        await this.send(peer, this.jwt)
      }
    }
  }

  onUnannounce(peer) {
    this.peers.delete(peer)
  }

  async set(value) {
    if (this.actor != this.me.id)
      throw `No permission to modify this object`
    if (!(value instanceof Object))
      throw `Value is not an object: ${JSON.stringify(value)}`

    const updated = Date.now()
    const jwt = await this.me.signMessage({
      value,
      updated,
      path: this.path
    })

    // Make sure the headers didn't get swapped?
    const { _, protectedHeader } =
      await jose.jwtVerify(jwt, jose.EmbeddedJWK)
    if (await jose.calculateJwkThumbprint(protectedHeader.jwk) != this.actor)
      throw "An error occurred during signing"

    await this.#store(value, updated, jwt)
  }

  async #store(value, updated, jwt) {
    // Don't destroy the object reference
    for (const prop in this._value) {
      if (!(prop in value))
        delete this._value[prop]
    }
    Object.assign(this._value, value)

    this.updated = updated
    this.jwt = jwt
    await this.gossip([...this.peers], jwt)
  }

  objectHandler() {
    return {
      get: (target, prop, receiver)=> {
        // Make sure handling is recursive
        if (typeof target[prop] === 'object' && target[prop] !== null) {
          return new Proxy(
            Reflect.get(target, prop, receiver), this.objectHandler())
        } else {
          return Reflect.get(target, prop, receiver)
        }
      },
      set: (target, prop, val, receiver)=> {
        if (this.actor != this.me.id) {
          throw "Trying to modify an object that isn't yours"
        }
        if (Reflect.set(target, prop, val, receiver)) {
          this.set(this._value)
          return true
        } else { return false }
      }, 
      deleteProperty: (target, prop)=> {
        if (this.actor != this.me.id) {
          throw "Trying to modify an object that isn't yours"
        }
        if (Reflect.deleteProperty(target, prop)) {
          this.set(this._value)
          return true
        } else { return false }
      }
    }
  }

  get value() {
    return new Proxy(this._value, this.objectHandler())
  }
}