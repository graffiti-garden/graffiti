import { sha256 } from '@noble/hashes/sha256'
import { randomBytes, concatBytes, utf8ToBytes } from '@noble/hashes/utils'
import { ed25519 as curve, edwardsToMontgomeryPub, edwardsToMontgomeryPriv, x25519 } from '@noble/curves/ed25519'

export interface Actor {
  nickname: string,
  rootSecretBase64: string
}

export interface ActorAnnouncement extends Event {
  uri?: string
}

interface ChannelMessage {
  action: string,
  uri: string,
  id: string
}

export function base64Encode(bytes: Uint8Array) : string {
  const base64 = btoa(String.fromCodePoint(...bytes))
  // Make sure it is url safe
  return base64.replace(/\+/g, '-')
               .replace(/\//g, '_')
}

export function base64Decode(str: string) : Uint8Array {
  const base64 = str.replace(/-/g, '+')
                    .replace(/_/g, '/')
  return new Uint8Array(Array.from(atob(base64), s=> s.codePointAt(0) ?? 0))
}

export function actorURIEncode(publicKey: Uint8Array) : string {
  return "actor:" + base64Encode(publicKey)
}

export function actorURIDecode(uri: string) : Uint8Array {
  return base64Decode(uri.slice(6))
}

export function deriveSigningPrivateKey(rootSecretMaybeBase64: Uint8Array|string) : Uint8Array {
  const rootSecret = typeof rootSecretMaybeBase64 == 'string' ?
    base64Decode(rootSecretMaybeBase64) : rootSecretMaybeBase64
  
  return sha256(concatBytes(utf8ToBytes('sign'), rootSecret))
}

export default class ActorManager {

  isInitialized = false

  events: EventTarget

  channel: BroadcastChannel
  channelID = crypto.randomUUID()

  constructor(events?: EventTarget) {
    this.events = events ?? new EventTarget()

    // Initialize
    ;(async ()=> {
      if (!document.hasStorageAccess || await document.hasStorageAccess()) {
        this._initialize()
      }
    })()
  }

  async initialize() : Promise<void> {
    // Get cross-origin storage permission
    // if logging in manually (with user activation)
    if (document.requestStorageAccess) {
      try {
        await document.requestStorageAccess()
      } catch(e) {
        console.error(e.toString())
        throw "The actor manager can't work without local storage access!"
      }
    }
    this._initialize()
  }

  async _initialize() : Promise<void> {
    this.channel = new BroadcastChannel("actors")
    this.channel.onmessage = this.onChannelMessage.bind(this)

    this.isInitialized = true
    this.events.dispatchEvent(new Event("initialized"))

    // Load all existing uris
    Object.keys(localStorage).forEach(uri=> this.announceActor("update", uri))
  }

  async tilInitialized() : Promise<void> {
    if (!this.isInitialized) {
      await new Promise<void>(resolve=>
        this.events.addEventListener(
          'initialized',
          ()=>resolve(), {
            passive: true,
            once: true
          }))
    }
  }

  async createActor(nickname: string) : Promise<string> {
    // Generate root secret
    const rootSecret = randomBytes(32)

    // Pack it up and store it locally
    const actor: Actor = {
      nickname,
      rootSecretBase64: base64Encode(rootSecret)
    }
    return this.storeActor(actor)
  }

  async storeActor(actor: Actor) : Promise<string> {
    const privateKey = deriveSigningPrivateKey(actor.rootSecretBase64)
    const uri = actorURIEncode(curve.getPublicKey(privateKey))

    await this.tilInitialized()
    localStorage.setItem(uri, JSON.stringify(actor))

    await this.announceActor("update", uri, true)

    return uri
  }

  async getActor(uri: string) : Promise<Actor> {
    await this.tilInitialized()
    if (!(uri in localStorage)) {
      throw `Actor with ID "${uri}" does not exist`
    }

    const actorString = localStorage.getItem(uri)
    return JSON.parse(actorString??'null')
  }

  async deleteActor(uri: string) : Promise<void> {
    const actor = await this.getActor(uri)

    if (!confirm(`Are you absolutely sure you want to delete the actor "${actor.nickname}". This cannot be undone.`)) {
      throw `User interaction denied deleting actor "${actor.nickname}", ID "${uri}".`
    }

    // Remove and announce the change
    localStorage.removeItem(uri)
    await this.announceActor("delete", uri, true)
  }

  async renameActor(uri: string, newNickname: string) : Promise<void> {
    const actor = await this.getActor(uri)
    if (actor.nickname != newNickname) {
      actor.nickname = newNickname
      localStorage.setItem(uri, JSON.stringify(actor))
      await this.announceActor("update", uri, true)
    }
  }

  async announceActor(
    action: string,
    uri: string,
    propogate: boolean=false
  ) : Promise<void> {

    // Announce the event locally
    const actorEvent: ActorAnnouncement = new Event(action)
    actorEvent.uri = uri
    this.events.dispatchEvent(actorEvent)

    if (propogate) {
      await this.tilInitialized()

      const channelMessage: ChannelMessage = {
        action,
        uri,
        id: this.channelID
      }
      this.channel.postMessage(channelMessage)
    }
  }

  async noncedSecret(uri: string, nonce: Uint8Array) : Promise<Uint8Array> {
    if (nonce.byteLength < 24) {
      throw "Nonce is too short"
    }
    const actor = await this.getActor(uri)
    return sha256(concatBytes(nonce, base64Decode(actor.rootSecretBase64)))
  }

  async sign(uri: string, message: Uint8Array) : Promise<Uint8Array> {
    const actor = await this.getActor(uri)
    return curve.sign(message, deriveSigningPrivateKey(actor.rootSecretBase64))
  }

  async sharedSecret(myURI: string, theirURI: string) : Promise<Uint8Array> {
    const myActor = await this.getActor(myURI)
    const myPriv = edwardsToMontgomeryPriv(deriveSigningPrivateKey(myActor.rootSecretBase64))
    const theirPub = edwardsToMontgomeryPub(actorURIDecode(theirURI))
    return x25519.getSharedSecret(myPriv, theirPub)
  }

  async onChannelMessage({data} : {data: ChannelMessage}) : Promise<void> {
    if (data.id != this.channelID) {
      await this.announceActor(data.action, data.uri)
    }
  }
}