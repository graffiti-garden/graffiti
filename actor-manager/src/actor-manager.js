import * as jose from 'jose'
import { cookieStore } from "cookie-store"

export default class ActorManager {

  #events = new EventTarget()
  #privateKeys = {}
  #_initialized = false
  #channel = null
  #channelID = crypto.randomUUID()
  #onInitialize = ()=>{}

  constructor(actorContainer, onInitialize) {
    this.actors = actorContainer ? actorContainer() : {}
    if (onInitialize) this.#onInitialize = onInitialize

    // Initialize
    ;(async ()=> {
      if (!document.hasStorageAccess || await document.hasStorageAccess()) {
        this.#_initialize()
      }
    })()
  }

  async initialize() {
    // Get cross-origin storage permission
    // if logging in manually (with user activation)
    if (document.requestStorageAccess) {
      try {
        await document.requestStorageAccess()
      } catch(e) {
        throw "The actor manager can't work without local storage access!"
      }
    }
    this.#_initialize()
  }

  async createActor(nickname, alg='ES256') {
    // Generate public private key
    const { publicKey, privateKey } =
      await jose.generateKeyPair(alg, { extractable: true })
    const jwk = await jose.exportJWK(publicKey)
    const pkcs8Pem = await jose.exportPKCS8(privateKey)
    const thumbprint = await jose.calculateJwkThumbprint(jwk)

    const actor = { thumbprint, jwk, nickname, alg }

    // Update internally and externally
    await this.#updateActor(actor, pkcs8Pem)

    return thumbprint
  }

  async deleteActor(thumbprint, propogate=true) {
    this.#checkActor(thumbprint)

    if (propogate) {
      const nickname = this.actors[thumbprint].nickname
      if (!confirm(`Are you absolutely sure you want to delete the actor "${nickname}". This cannot be undone.`)) {
        throw `User interaction denied deleting actor "${nickname}", ID "${thumbprint}".`
      }
    }

    // Delete all associations
    delete this.actors[thumbprint]
    delete this.#privateKeys[thumbprint]

    // Delete in the database
    await this.#deleteActorCookie(thumbprint)

    // Update others of the change
    this.#forwardAction("delete-actor", thumbprint, propogate)
  }

  async renameActor(thumbprint, nickname) {
    this.#checkActor(thumbprint)
    const actor = this.actors[thumbprint]
    if (actor.nickname != nickname) {
      actor.nickname = nickname
      await this.#updateActor(actor, null)
    }
  }

  async sign(message, thumbprint) {
    this.#checkActor(thumbprint)
    const nickname = this.actors[thumbprint].nickname
    if (!confirm(`Would you allow this app to use the actor "${nickname}"?`)) {
      throw `User interaction denied signing ${JSON.stringify(message)} with actor "${nickname}", ID "${thumbprint}".`
    }

    const { jwk, alg } = this.actors[thumbprint]
    const privateKey = this.#privateKeys[thumbprint]

    return await new jose.SignJWT(message)
      .setProtectedHeader({ jwk, alg })
      .sign(privateKey)
  }

  async verify(signed) {
    const { payload, protectedHeader } =
      await jose.jwtVerify(signed, jose.EmbeddedJWK)
    const actor = await jose.calculateJwkThumbprint(protectedHeader.jwk)
    return { payload, actor }
  }

  #checkActor(thumbprint) {
    if (!(thumbprint in this.actors)) {
      throw `Actor with ID "${thumbprint}" does not exist.`
    }
  }

  async #_initialize() {
    this.#channel = new BroadcastChannel("actors")
    this.#channel.onmessage = this.#onChannelMessage.bind(this)

    this.#_initialized = true
    this.#onInitialize()
    this.#events.dispatchEvent(new Event("initialized"))

    // Load all existing things from the database
    for (const { value } of await cookieStore.getAll()) {
      let actor, pkcs8Pem
      try {
        ;({ actor, pkcs8Pem } = JSON.parse(value))
      } catch(e) {
        continue
      }
      this.#updateActor(actor, pkcs8Pem, false)
    }
  }

  async #initialized() {
    if (!this.#_initialized) {
      await new Promise(resolve=>
        this.#events.addEventListener(
          'initialized',
          ()=>resolve()), {
            passive: true,
            once: true
          })
    }
  }

  async #putActorCookie(actor, pkcs8Pem) {
    await this.#initialized()
    if (!pkcs8Pem) {
      const { value } = await cookieStore.get(actor.thumbprint)
      try {
        ;({ pkcs8Pem } = JSON.parse(value))
      } catch {
        throw `Actor with ID ${thumbprint} does not have a private key`
      }
    }
    await cookieStore.set({
      name: actor.thumbprint,
      value: JSON.stringify({
        actor,
        pkcs8Pem
      }),
      expires: Date.now() + 1e14, // > 1 year
      sameSite: 'lax',
      partitioned: false,
      // secure: true
    })
  }

  async #deleteActorCookie(thumbprint) {
    await this.#initialized()
    await cookieStore.delete(thumbprint)
  }

  async #forwardAction(action, payload, propogate) {
    if (propogate) {
      await this.#initialized()
      this.#channel.postMessage(
        JSON.parse(JSON.stringify({
          action,
          payload,
          id: this.#channelID
        }))
      )
    }
  }

  async #updateActor(actor, pkcs8Pem, propogate=true) {
    // Update the actor internally
    // and potentially unpack the keys
    if (!pkcs8Pem && !(actor.thumbprint in this.#privateKeys)) {
      throw `Private key does not exist for actor ${actor.thumbprint}.`
    }
    this.actors[actor.thumbprint] = actor
    if (pkcs8Pem && !(actor.thumbprint in this.#privateKeys)) {
      this.#privateKeys[actor.thumbprint] =
        await jose.importPKCS8(
          pkcs8Pem,
          actor.alg
        )
    }

    // Save it in the database
    await this.#putActorCookie(actor, pkcs8Pem)

    // Update others of the change
    this.#forwardAction("update-actor", { actor, pkcs8Pem }, propogate)
  }

  async #onChannelMessage({data: {action, payload, id}}) {
    if (id == this.#channelID) return
    if (action == "update-actor") {
      const { actor, pkcs8Pem } = payload
      await this.#updateActor(actor, pkcs8Pem, false)
    } else if (action == "delete-actor") {
      await this.deleteActor(payload, false)
    }
  }
}