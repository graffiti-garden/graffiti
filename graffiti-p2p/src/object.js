import { sign, verify } from './crypto'
import GraffitiContext from './context'
import { set, get, createStore } from 'idb-keyval';
import { sha256Hex } from './util';

export default class GraffitiObject {

  static toURI(actor, path) {
    if(typeof actor === "undefined")
      throw "Actor is not defined"
    if (!actor.startsWith('actor:')) {
      throw "Actor URI is invalid"
    }
    actor = actor.slice(6)
    return `object:${actor}:${path}`
  }

  constructor(actorClient, wrapper, actor, path, container) {
    this.actor = actor
    this.path = path
    this.id = this.constructor.toURI(actor, path)
    this.wrapper = wrapper
    this.actorClient = actorClient

    this.objectContainer = container
    this._value = container? container() : {}
    Object.defineProperty(this._value, 'id', {value: this.id})
    Object.defineProperty(this._value, 'actor', {value: actor})
    Object.defineProperty(this._value, 'path', {value: path})

    this.updated = 0
    this.signed = null
    this.signedHash = null

    this.objectStore = createStore('graffiti', 'objects')
  }

  async delete() {
    await this.post(
      // Remove all properties
      v=>Object.keys(v).forEach(k=> delete v[k]))
  }

  async post(func) {
    // Clone and apply the functions
    const clone = JSON.parse(JSON.stringify(this._value))
    if (func) func(clone)

    let updated, pathHash, signed
    try {
      ({ updated, pathHash, signed } = await sign(clone, this.actor, this.path, this.actorClient))
    } catch(e) {
      throw e
    }

    this.onVerified({
      updated,
      pathHash,
      actor: this.actor,
      path: this.path,
      signedHash: await sha256Hex(signed),
      value: clone
    }, signed)

    return this.value
  }

  onMessage(peer, message) {
    if ('have' in message) {
      if ( message.have != this.signedHash ) {
        this.send(peer, { request: message.have })
      }

    } else if ('request' in message) {
      if (message.request == this.signedHash) {
        this.send(peer, {
          signed: this.signed,
          signedHash: this.signedHash
        })
      }

    } else if ('signed' in message && 'signedHash' in message) {
      if (message.signedHash == this.signedHash) return

      verify(message.signed, this.actorClient, { path: this.path, signedHash: message.signedHash}).then(
        verified=> this.onVerified(verified, message.signed)
      )
    }
  }

  onAnnounce(peer) {
    if (this.signedHash) {
      this.send(peer, { have: this.signedHash } )
    }
  }

  onVerified(verified, signed) {
    const { updated, signedHash, actor, value, path } = verified

    // Make sure actor and path are right
    if (actor != this.actor) return
    if (path  != this.path)  return
    // Make sure it is new
    if (updated <= this.updated) return

    this.signed = signed
    this.signedHash = signedHash
    this.updated = updated

    // Store the old context
    const oldContext = [...(this._value.context??[])]

    // Assign the new value without destroying the reference
    for (const prop in this._value) {
      if (!(prop in value))
        delete this._value[prop]
    }
    Object.assign(this._value, value)

    const allContexts = new Set([
      ...oldContext,
      ...(this._value.context ?? [])
    ])
    allContexts.forEach(context=> {
      const contextWrapper = this.wrapper.get(GraffitiContext, context, this.objectContainer)
      contextWrapper.onVerified(verified, signed)
    })

    set(this.id, { verified, signed }, this.objectStore)

    this.gossip({ have: signedHash })
  }

  objectHandler() {
    return {
      get: (target, prop, receiver)=> {
        // Make sure handling is recursive
        const got = Reflect.get(target, prop, receiver)
        return (typeof got === 'object' && got !== null)?
          new Proxy(got, this.objectHandler()) : got
      },
      set: (target, prop, val, receiver)=> {
        this.post(target=> Reflect.set(target, prop, val))
        return true
      }, 
      deleteProperty: (target, prop)=> {
        this.post(target=> Reflect.deleteProperty(target, prop))
        return true
      }
    }
  }

  get value() {
    return new Proxy(this._value, this.objectHandler())
  }
}