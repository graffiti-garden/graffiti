import * as jose from 'jose'
import { client, server } from '@passwordless-id/webauthn' 
import { get, set } from 'idb-keyval'
import { sha256Hex } from './util'

export default class ActorManager {

  constructor(options) {
    options = {
      objectConstructor: ()=>({}),
      ...options
    }
    this.meWrapper = options.objectConstructor()

  }

  get me() {
    return this.meWrapper.value
  }

  async createActor(name) {
    const challenge = crypto.randomUUID()

    let registration
    await navigator.locks.request("actorManager", async()=> {
      registration = await client.register(name, challenge, {
        "authenticatorType": "auto",
        "userVerification": "required",
        "attestation": false,
        "debug": false
      })
    });


    // Store the public key
    const credential = registration.credential
    await set(credential.id, credential)

    // Set "me"
    this.meWrapper.value = credential.id
    return this.me
  }

  async selectActor() {
    const challenge = crypto.randomUUID()

    let authentication
    await navigator.locks.request("actorManager", async()=> {
      authentication = await client.authenticate([], challenge, {
        "authenticatorType": "auto",
        "userVerification": "discouraged",
        "debug": false
      })
    })

    const id = authentication.credentialId
    if (!await get(id)) {
      throw "No public key exists for that user."
    }
    this.meWrapper.value = credential.id
    return this.me
  }

  async sign(object, actor) {
    actor = actor? actor : this.me
    console.log(actor)

    const jwt = new jose.UnsecuredJWT(object).encode()

    // Add the signature with webauthn
    let authentication
    await navigator.locks.request("actorManager", async()=> {
      authentication = await client.authenticate(
        [actor],
        await sha256Hex(jwt),
        {
          "userVerification": "discouraged",
          "debug": false
        }
      )
    })

    // Make sure to get the certificate associated
    const credential = await get(actor)
    if (!credential)
      throw "No stored public key associated with this user."

    return { jwt, authentication, credential }
  }

  async verify({jwt, authentication, credential}) {
    await server.verifyAuthentication(
      authentication,
      credential,
      {
        challenge: await sha256Hex(jwt),
        origin: ()=> true
      })

    return {
      payload: jose.UnsecuredJWT.decode(jwt).payload,
      actor: credential.id
    }
  }
}