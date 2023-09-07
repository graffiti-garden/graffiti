import { sign, verify } from './crypto'
import { sha256Hex } from './util'
import GraffitiObject from "./object"

export default class GraffitiContext {
  static toURI(contextPath) {
    return `context:${contextPath}`
  }

  constructor(actorClient, wrapper, contextPath, objectContainer) {
    this.actorClient = actorClient
    this.wrapper = wrapper
    this.contextPath = contextPath
    this.objectContainer = objectContainer

    this.posts = {} // hashURI-> { updated, sighedHash }
    this.signed = {} // signedHash -> signed
  }

  onAnnounce(peer) {
    this.send(peer, {
      have: Object.keys(this.signed)
    })
  }

  onMessage(peer, message) {
    if ('have' in message) {
      // Ask for all the pieces we don't have
      const request = message.have.filter(
        signedHash=> !(signedHash in this.signed)
      )
      if (request.length) {
        this.send(peer, { request })
      }

    } else if ('request' in message) {
      // Send the pieces we do have
      message.request.forEach(signedHash=> {
        if (signedHash in this.signed) {
          this.send(peer, {
            signed: this.signed[signedHash],
            signedHash
          })
        }
      })

    } else if ('signed' in message && 'signedHash' in message) {

      // Ignore pieces we already have
      if (message.signedHash in this.signed) return

      // Make sure it checks out
      verify(message.signed, this.actorClient, { contextPath: this.contextPath, signedHash: message.signedHash}).then(
        verified=> this.onVerified(verified, message.signed)
      )
    }
  }

  onVerified(verified, signed) {
    const { pathHash, updated, signedHash, actor, path, value } = verified

    // Is our context relevant?
    if (!value.context || !value.context.includes(this.contextPath)) return

    const hashURI = GraffitiObject.toURI(actor, pathHash)

    // Does post already exist?
    if (hashURI in this.posts) {
      if (updated <= this.posts[hashURI].updated ?? 0) return
    }

    // Add it to our own posts
    this.posts[hashURI] = { updated, signedHash }
    this.signed[signedHash] = signed

    // Seed the object
    if (path) {
      const object = this.wrapper.get(GraffitiObject, actor, path, this.objectContainer)
      object.onVerified(verified, signed)
    }

    // Gossip to peers
    this.gossip({
      have: [signedHash]
    })
  }
}