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
    this.eventTarget = new EventTarget()
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
    await this.onAnnounce(peer)

    // Verify the JWT and the signature
    let unsigned, actor, value, path
    try {
      ;({ unsigned, actor, value, path } =
         await verify(signed, this.actorClient, { contextPath: this.contextPath}))
    } catch(e) {
      return
    }
    const hashURI = GraffitiObject.toURI(actor, unsigned.hashPath)

    // Does post already exist?
    if (hashURI in this._posts) {
      if (unsigned.updated <= this._posts[hashURI].updated ?? 0) return
    }

    const object = path? this.wrapper.get(GraffitiObject, actor, path, this.objectContainer) : null

    // If we already have a value and the update does not have one
    if (hashURI in this._posts && this._posts[hashURI].value && !value) {
      const updateEvent = new Event("update")
      updateEvent.update = {
        action: "delete",
        hashURI
      }
      this.eventTarget.dispatchEvent(updateEvent)
    } else if ( !(hashURI in this._posts && this._posts[hashURI].value) && value) {
      const updateEvent = new Event("update")
      updateEvent.update = {
        action: "add",
        value: object.value,
        hashURI
      }
      this.eventTarget.dispatchEvent(updateEvent)
    }

    this._posts[hashURI] = {
      updated: unsigned.updated,
      signed,
      value: value? object.value : null
    }
    if (object) {
      await object.onMessage(null, signed)
    }
    this.gossip([...this.peers], signed)
  }

  async * posts(signal) {
    yield * Object.entries(this._posts)
      .filter(([hashURI, {value}])=>value)
      .map   (([hashURI, {value}])=>({
        action: "add",
        value,
        hashURI
      }))

    let results = []
    let resolve, reject, promise
    const makePromise = ()=> {
      promise = new Promise((_resolve, _reject)=> {
        resolve = _resolve
        reject = _reject
      })
    }
    makePromise()

    const retreive = e=> {
      results.push(e.update)
      resolve()
      makePromise()
    }
    this.eventTarget.addEventListener(
      "update",
      retreive,
      { passive: true })

    const abort = ()=> {
      this.eventTarget.removeEventListener("update", retreive)
      reject(signal.reason)
    }
    signal?.addEventListener(
      "abort",
      abort,
      { once: true, passive: true }
    )

    while (true) {
      await promise
      yield * results
      results = []
    }
  }
}