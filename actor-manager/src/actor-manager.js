import * as jose from 'jose'
import { client, server } from '@passwordless-id/webauthn' 
import { cookieStore } from "cookie-store"

const webauthnOptions = {
  authenticatorType: "auto",
  userVerification: "discouraged",
  attestation: false,
  debug: false,
  mediation: "silent"
}

export default class ActorManager {

  constructor(tracker="https://tracker.graffiti.garden") {
    this.tracker = tracker
  }

  async createActor(name) {
    const challenge = crypto.randomUUID()

    // Create the public key with webauthn
    let registration
    await navigator.locks.request("actorManager", async()=> {
      registration = await client.register(name, challenge, webauthnOptions)
    });

    // Store the public key in the keyserver
    const credential = registration.credential
    await fetch(`${this.tracker}/key`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credential)
    })

    // And in local storage...
    localStorage.setItem(credential.id, JSON.stringify(credential))

    return credential.id
  }

  async selectActor() {
    const challenge = crypto.randomUUID()

    let authentication
    await navigator.locks.request("actorManager", async()=> {
      authentication = await client.authenticate([], challenge, webauthnOptions)
    })

    return authentication.credentialId
  }

  async sign(object, actor) {
    if (!actor)
      throw "You must sign with an actor ID"

    const jwt = new jose.UnsecuredJWT(object).encode()

    // Add the signature with webauthn
    let authentication
    await navigator.locks.request("actorManager", async()=> {
      authentication = await client.authenticate(
        [actor],
        await sha256Hex(jwt),
        webauthnOptions)
    })

    return { jwt, authentication }
  }

  async verify({ jwt, authentication }) {
    // Try to get the credential from local storage...
    const credentialString = localStorage.getItem(authentication.credentialId)

    let credential
    if (!credentialString) {
      // If not, get it from the key server and cache
      const response = await fetch(`${this.tracker}/key/${authentication.credentialId}`)
      if (response.status != "200") throw "Public key is not in key server"
      credential = await response.json()
      localStorage.setItem(credential.id, JSON.stringify(credential))
    } else {
      credential = JSON.parse(credentialString)
    }

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

export const encoder = new TextEncoder()
export const decoder = new TextDecoder()

export async function sha256Uint8(message) {
  const msgUint8 = encoder.encode(message)
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8)
  return new Uint8Array(hashBuffer)
}

export function uint8ToHex(uint8) {
  return Array.from(uint8)
    .map(b=> b.toString(16).padStart(2, "0"))
    .join('')
}

export async function sha256Hex(message) {
  return uint8ToHex(await sha256Uint8(message))
}