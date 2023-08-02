import { verify } from './crypto'
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

      if (!value) {
        delete this._posts[hashURI]

        const updateEvent = new Event("update")
        updateEvent.update = {
          action: "delete",
          hashURI
        }
        this.eventTarget.dispatchEvent(updateEvent)
      }
    } else {
      if (value && value.context && value.context.includes(this.contextPath)) { 
        const object = this.wrapper.get(GraffitiObject, actor, path, this.objectContainer)
        this._posts[hashURI] = {
          value: object.value,
          updated: unsigned.updated,
          signed
        }

        const updateEvent = new Event("update")
        updateEvent.update = {
          action: "add",
          value: object.value,
          hashURI
        }
        this.eventTarget.dispatchEvent(updateEvent)
      }
    }

    if (path) {
      const object = this.wrapper.get(GraffitiObject, actor, path, this.objectContainer)
      await object.onMessage(null, signed)
    }
  }

  async * posts(signal) {
    for (const [hashURI, {value}] of Object.entries(this._posts)) {
      yield {
        action: "add",
        value,
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