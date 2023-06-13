import { cookieStore } from "cookie-store"
import * as jose from "jose"
import { ref, reactive } from "vue"

class ActorManager {
  constructor() {
    this.actors = {}
    this.privateKeys = {}
    this.origins = {}
    this.onchange = ()=>{}
    this._loggedIn = false
    this.events = new EventTarget()

    // If already have access, log in
    ;(async ()=> {
      if (!document.hasStorageAccess || await document.hasStorageAccess()) {
        this._logIn()
      }
    })()
  }

  async logIn() {
    // Get cross-origin storage permission
    // if logging in manually (with user activation)
    try {
      await document.requestStorageAccess()
    } catch(e) {
      throw "The actor manager can't work without local storage access!"
    }
    this._logIn()
  }

  async _logIn() {
    this.channel = new BroadcastChannel("actors")
    this.channel.onmessage = this.onChannelMessage.bind(this)

    this._loggedIn = true
    this.events.dispatchEvent(new Event("log-in"))
    this.forwardAction("log-in", null, false)

    // Load all existing things from the database
    for (const cookie of await cookieStore.getAll()) {

      // Refresh the cookie's expiration
      await this.put(cookie.name, cookie.value)

      const name = cookie.name
      const value = JSON.parse(cookie.value)
      if (name.startsWith('actor')) {
        this.updateActor(value, false)
      } else if (name.startsWith('origin')) {
        const {origin, thumbprint} = value
        this.updateOrigin(origin, thumbprint, false)
      }
    }
  }

  async loggedIn() {
    if (!this._loggedIn) {
      await new Promise(resolve=>
        this.events.addEventListener(
          'log-in',
          ()=>resolve()), {
            passive: true,
            once: true
          })
    }
  }

  async put(name, value) {
    value = JSON.stringify(value)
    await this.loggedIn()
    await cookieStore.set({
      name, value,
      expires: Date.now() + 1e12, // > 1 year
      sameSite: 'none',
      partitioned: false
    })
  }

  async delete(name) {
    await this.loggedIn()
    await cookieStore.delete(name)
  }

  async createActor(nickname, alg='ES256') {
    // Generate public private key
    const { publicKey, privateKey } =
      await jose.generateKeyPair(alg, { extractable: true })
    const jwk = await jose.exportJWK(publicKey)
    const pkcs8Pem = await jose.exportPKCS8(privateKey)
    const thumbprint = await jose.calculateJwkThumbprint(jwk)

    const actor = { thumbprint, jwk, pkcs8Pem, nickname, alg }

    // Update internally and externally
    await this.updateActor(actor)

    return actor
  }

  async updateActor(actor, propogate=true) {
    // Update the actor internally
    // and potentially unpack the keys
    this.actors[actor.thumbprint] = actor
    if (!(actor.thumbprint in this.privateKeys)) {
      this.privateKeys[actor.thumbprint] =
        await jose.importPKCS8(
          actor.pkcs8Pem,
          actor.alg
        )
    }

    // Save it in the database
    await this.put(
      `actor:${actor.thumbprint}`,
      JSON.parse(JSON.stringify(actor)))

    // Update others of the change
    this.forwardAction("update-actor", actor, propogate)
  }

  async removeActor(actor, propogate=true) {
    const thumbprint = actor.thumbprint
    if (!(actor.thumbprint in this.actors)) return

    // Delete all associations
    delete this.actors[thumbprint]
    delete this.privateKeys[thumbprint]

    // Delete in the database
    await this.delete(`actor:${thumbprint}`)

    // Remove any origins associated with the actor
    Object.keys(this.origins).forEach(async o=>{
      if (this.origins[o] == thumbprint) {
        // Don't propogate because this is implicit
        await this.removeOrigin(o, false)
      }
    })

    // Update others of the change
    this.forwardAction("remove-actor", actor, propogate)
  }

  async updateOrigin(origin, thumbprint, propogate=true) {
    if (origin in this.origins && 
        this.origins[origin] == thumbprint) return

    this.origins[origin] = thumbprint
    const value = {origin, thumbprint}

    await this.put(`origin:${origin}`, value)
    this.forwardAction("update-origin", value, propogate)
  }

  async removeOrigin(origin, propogate=true) {
    if (!(origin in this.origins)) return

    delete this.origins[origin]
    await this.delete(`origin:${origin}`)

    this.forwardAction("remove-origin", origin, propogate)
  }

  forwardAction(action, payload, propogate) {
    const message = { action, payload }
    this.onchange(message)
    if (propogate) {
      this.channel.postMessage(
        JSON.parse(JSON.stringify(message)))
    }
  }

  async rename(actor, nickname) {
    if (actor.nickname != nickname) {
      actor.nickname = nickname
      await this.updateActor(actor)
    }
  }

  async onChannelMessage({data: {action, payload}}) {
    if (action == "update-actor") {
      await this.updateActor(payload, false)
    } else if (action == "remove-actor") {
      await this.removeActor(payload, false)
    } else if (action == "update-origin") {
      const {origin, thumbprint} = payload
      await this.updateOrigin(origin, thumbprint, false)
    } else if (action == "remove-origin") {
      await this.removeOrigin(payload, false)
    }
  }

  async sign(origin, message) {
    if (!(origin in this.origins)) {
      throw "This origin does not have permission to embody any actor."
    }

    const thumbprint = this.origins[origin]
    const { jwk, alg } = this.actors[thumbprint]
    const privateKey = this.privateKeys[thumbprint]

    return await new jose.SignJWT(message)
      .setProtectedHeader({ jwk, alg })
      .sign(privateKey)
  }
}

export default function useActorManager() {

  const loggedIn = ref(false)
  const actors = reactive({})
  const origins = reactive({})

  const actorManager = new ActorManager()
  actorManager.onchange =
    ({ action, payload })=> {

      if (action == 'log-in') {
        loggedIn.value = true

      } else if (action.endsWith("actor")) {
        const actor = payload
        const thumbprint = actor.thumbprint

        if (action.startsWith("update")) {
          actors[thumbprint] = actor
        } else {
          delete actors[thumbprint]
        }

      } else if (action.endsWith("origin")) {

        if (action.startsWith("update")) {
          const {origin, thumbprint} = payload
          origins[origin] = thumbprint
        } else {
          if (payload in origins) {
            delete origins[payload]
          }
        }
      }
    }

  return { actorManager, loggedIn, actors, origins }
}
