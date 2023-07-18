class GraffitiObject {

  static toURI(actor, path) {
    return `object:${actor}:${path}`
  }

  constructor(actor, path, options) {
    this.jwt = null
    this.actor = actor
    this.path = path
    this.updated = 0

    options = {
      objectConstructor: ()=>({}),
      signMessage: async message=>{
        const alg = 'ES256'
        const { publicKey, privateKey } =
          await jose.generateKeyPair(alg, { extractable: true })
        const jwk = await jose.exportJWK(publicKey)

        return await new jose.SignJWT(message)
          .setProtectedHeader({ jwk, alg })
          .sign(privateKey)
      },
      ...options
    }

    this.signMessage = options.signMessage

    this._value = options.objectConstructor()
    Object.defineProperty(this._value, '__graffiti', { value: true })
    Object.defineProperty(this._value, 'id', {value: uri})
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
    if (!this.isObject(payload.value)) return

    this.store(payload.value, payload.updated, jwt)
  }

  async onAnnounce(peer) {
    if (!(this.peers.has(peer))) {
      if (this.jwt) {
        await this.wire.send(peer, this.jwt)
      }
      this.peers.add(peers)
    }
  }

  onUnannounce(peer) {
    this.peers.delete(peer)
  }

  async set(value) {
    const jwt = await this.signMessage({
      value,
      updated,
      path
    })

    this.#store(value, updated, jwt)
  }

  #store(value, updated, jwt) {
    // Don't destroy the object reference
    for (const prop in this._value) {
      if (!(prop in value))
        delete this._value[prop]
    }
    Object.assign(this._value, value)

    this.updated = updated
    this.jwt = jwt
    this.wire.gossip(peers, jwt)
  }

  value() {
    return new Proxy(this._value, {

      get: (target, prop, receiver)=> {
        // Make sure handling is recursive
        if (typeof target[prop] === 'object' && target[prop] !== null) {
          return new Proxy(
            Reflect.get(target, prop, receiver), this.objectHandler(identity))
        } else {
          return Reflect.get(target, prop, receiver)
        }
      },
      set: (target, prop, val, receiver)=> {
        if (!identity || identity.actor != this.actor) {
          throw "Trying to modify an object that isn't yours"
        }
        if (Reflect.set(target, prop, val, receiver)) {
          // Set the value
          this.set(this._value, identity)
          return true
        } else { return false }
      }, 
      deleteProperty: (target, prop)=> {
        if (!identity || identity.actor != this.actor) {
          throw "Trying to modify an object that isn't yours"
        }
        if (Reflect.deleteProperty(target, prop)) {
          this.set(this._value, identity)
          return true
        } else { return false }
      }
    })
  }
}