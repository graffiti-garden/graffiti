import * as jose from "https://cdn.jsdelivr.net/npm/jose@4.13.1/+esm"

export default class Actors {
  constructor() {
    this.actors = {}
    this.keys = {}
    this.origins = new Set()
    this.onchange = ()=>{}
    this.dbInitialized = false
    this.events = new EventTarget()

    document.hasStorageAccess().then(hasAccess=> {
      if (!hasAccess) throw "The actor manager can't work without local storage access!"

      this.channel = new BroadcastChannel("actors")
      this.channel.onmessage = this.onChannelMessage.bind(this)

      // Connect to the database
      // to store and load identities
      const request = indexedDB.open("actorstest3", 1)
      request.onupgradeneeded = e=> {
        const db = e.target.result
        db.createObjectStore("actors", {
          keyPath: "thumbprint"
        })
        db.createObjectStore("origins", {
          keyPath: "origin"
        })
      }

      // Load all existing things from the database
      request.onsuccess = async e=> {
        this.db = e.target.result
        this.dbInitialized = true
        this.events.dispatchEvent(new Event("dbInitialized"))

        // Load previous actors and origins
        this.store("actors").then(s=>
          s.openCursor().onsuccess = 
            ({target: { result: cursor }})=> {
              if (cursor) {
                this.updateActor(cursor.value, false)
                cursor.continue()
              }
            }
        )
        this.store("origins").then(s=>
          s.openCursor().onsuccess = 
            ({target: { result: cursor }})=> {
              if (cursor) {
                this.updateOrigin(...Object.entries(cursor.value)[0], false)
                cursor.continue()
              }
            }
        )
      }
    })
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

  async store(s) {
    if (!this.dbInitialized) {
      await new Promise(resolve=>
        this.events.addEventListener(
          'dbInitialized',
          ()=>resolve()))
    }

    return this.db
        .transaction([s], "readwrite")
        .objectStore(s)
  }

  async updateActor(actor, propogate=true) {
    // Update the actor internally
    // and potentially unpack the keys
    this.actors[actor.thumbprint] = actor
    if (!(actor.thumbprint in this.keys)) {
      this.keys[actor.thumbprint] =
        await jose.importPKCS8(
          actor.pkcs8Pem,
          actor.alg, 
          { extractable: true }
        )
    }

    // Save it in the database
    const store = await this.store("actors")
    store.put(JSON.parse(JSON.stringify(actor)))

    // Update others of the change
    this.forwardAction("update-actor", actor, propogate)
  }

  async removeActor(actor, propogate=true) {
    const thumbprint = actor.thumbprint
    if (!(actor.thumbprint in this.actors)) return

    // Delete all associations
    delete this.actors[thumbprint]
    delete this.keys[thumbprint]

    // Delete in the database
    const store = await this.store("actors")
    store.delete(thumbprint)

    // Update others of the change
    this.forwardAction("remove-actor", actor, propogate)
  }

  async updateOrigin(origin, thumbprint, propogate=true) {
    if (origin in this.origins && 
        this.origins[origin] == thumbprint) return

    this.origins[origin] = thumbprint

    const store = await this.store("origins")
    store.put({origin: thumbprint})

    this.forwardAction("update-origin", {origin: thumbprint}, propogate)
  }

  async removeOrigin(origin, propogate=true) {
    if (!this.origins.has(origin)) return

    this.origins.delete(origin)
    ;(await this.store("origins")).delete(origin)
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
    console.log(actor)
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
      await this.updateOrigin(payload, false)
    } else if (action == "remove-origin") {
      await this.removeOrigin(payload, false)
    }
  }

  async sign(thumbprint, origin, message) {
    if (!(thumbprint in this.actors) ||
        !this.origins.has(origin)) {
      throw "The actor you're trying to embody either does not exist, or you do not have permission to be them."
    }

    const { jwk, alg, privateKey } = this.actors[thumbprint]

    return await new jose.SignJWT(message)
      .setProtectedHeader({ jwk, alg })
      .sign(privateKey)
  }
}
