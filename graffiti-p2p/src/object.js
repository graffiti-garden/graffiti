import { sign, verify } from './crypto'
import GraffitiContext from './context'
import { set, get, createStore } from 'idb-keyval';

export default class GraffitiObject {

  static toURI(actor, path) {
    if(typeof actor === "undefined")
      throw "Actor is not defined"
    return `object:${actor}:${path}`
  }

  constructor(actorClient, wrapper, actor, path, container) {
    this.actor = actor
    this.path = path
    this.id = this.constructor.toURI(actor, path)
    this.wrapper = wrapper
    this.actorClient = actorClient

    this._value = container? container() : {}
    Object.defineProperty(this._value, 'id', {value: this.id})
    Object.defineProperty(this._value, 'actor', {value: actor})
    Object.defineProperty(this._value, 'path', {value: path})

    this.peers = new Set() 
    this.functionsToApply = new Set()
    this.unsigned = {}
    this.signed = null

    this.objectStore = createStore('graffiti', 'objects')
    get(this.id, this.objectStore).then(fromStore=> {
      if (fromStore) {
        this.onMessage(null, fromStore.signed)
      }
    })
  }

  apply(func) {
    this.functionsToApply.add(func)
    return this
  }

  async delete() {
    await this
    // Remove all properties
    .apply(v=>Object.keys(v).forEach(k=> delete v[k]))
    // And post
    .post()
  }

  async post() {
    // Apply the functions
    const existing = JSON.parse(JSON.stringify(this._value))
    this.functionsToApply.forEach(func=>func(this._value))
    this.functionsToApply.clear()

    let unsigned, signed
    try {
      ({ unsigned, signed } = await sign(this._value, this.actorClient))
    } catch(e) {
      // Restore the original object without
      // without destroying reference
      for (const prop in this._value) {
        if (!(prop in existing))
          delete this._value[prop]
      }
      Object.assign(this._value, existing)
      throw e
    }

    await this.#store(unsigned, signed, existing.context, this._value.context)

    return this.value
  }

  async onMessage(peer, signed) {
    await this.onAnnounce(peer)

    let unsigned, actor, value
    try {
       ({ unsigned, actor, value } =
         await verify(signed, this.actorClient, { path: this.path}))
    } catch {
      return
    }

    // Make sure actor is right
    if (actor != this.actor) return
    // Make sure it is new
    if (unsigned.updated <= this.unsigned.updated ?? 0) return

    // Don't destroy the object reference
    const oldContext = [...(this._value.context??[])]
    for (const prop in this._value) {
      if (!(prop in value))
        delete this._value[prop]
    }
    Object.assign(this._value, value)

    await this.#store(unsigned, signed, oldContext, this._value.context)
  }

  async onAnnounce(peer) {
    if (!peer) return
    if (!this.peers.has(peer)) {
      this.peers.add(peer)
      if (this.signed) {
        this.send(peer, this.signed)
      }
    }
  }

  onUnannounce(peer) {
    this.peers.delete(peer)
  }

  async #store(unsigned, signed, oldContext, newContext) {
    this.unsigned = unsigned
    this.signed = signed

    const allContexts = [...new Set([
      ...(oldContext ?? []),
      ...(newContext ?? [])
    ])]
    for (const context of allContexts) {
      const contextWrapper = this.wrapper.get(GraffitiContext, context, this.objectContainer)
      await contextWrapper.onMessage(null, signed)
    }

    set(this.id, {actor: this.actor, path: this.path, signed}, this.objectStore)

    this.gossip([...this.peers], signed)
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
        this.apply(()=> Reflect.set(target, prop, val, receiver)).post()
        return true
      }, 
      deleteProperty: (target, prop)=> {
        this.apply(()=> Reflect.deleteProperty(target, prop)).post()
        return true
      }
    }
  }

  get value() {
    return new Proxy(this._value, this.objectHandler())
  }
}