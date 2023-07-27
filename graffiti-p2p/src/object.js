export default class GraffitiObject {

  static toURI(actor, path) {
    if(typeof actor === "undefined")
      throw "Actor is not defined"
    return `object:${actor}:${path}`
  }

  constructor(actor, path, actorClient) {
    this.jwt = null
    this.actor = actor
    this.path = path
    this.updated = 0

    this.actorClient = actorClient

    this._value = {}
    Object.defineProperty(this._value, 'id', {value: this.constructor.toURI(actor, path)})
    Object.defineProperty(this._value, 'actor', {value: actor})
    Object.defineProperty(this._value, 'path', {value: path})

    this.peers = new Set() 
  }

  async onMessage(peer, signed) {
    await this.onAnnounce(peer)

    // Verify the JWT and the signature
    const { payload, actor } = await this.actorClient.verify(signed)

    if (payload.updated <= this.updated) return
    if (actor != this.actor ) return
    if (payload.path != this.path) return
    if (!(payload.value instanceof Object)) return

    this.#store(payload.value, payload.updated, signed)
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
    if (!(value instanceof Object))
      throw `Value is not an object: ${JSON.stringify(value)}`
    const updated = Date.now()

    // Pack it up into a JWT
    const signed = await this.actorClient.sign({
      value,
      updated,
      path: this.path
    }, this.actor)

    await this.#store(value, updated, signed)
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
        const existing = Reflect.get(target, prop, receiver)
        if (Reflect.set(target, prop, val, receiver)) {
          this.set(this._value).catch(error=> {
            if (existing) {
              Reflect.set(target, prop, existing, receiver)
            }
            throw error
          })
          return true
        } else { return false }
      }, 
      deleteProperty: (target, prop)=> {
        const existing = Reflect.get(target, prop)
        if (Reflect.deleteProperty(target, prop)) {
          this.set(this._value).catch(error=> {
            if (existing) {
              Reflect.set(target, prop, existing)
            }
            throw error
          })
          return true
        } else { return false }
      }
    }
  }

  get value() {
    return new Proxy(this._value, this.objectHandler())
  }
}