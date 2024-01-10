import * as stringify from 'fast-json-stable-stringify'

export function base64Encode(bytes) {
  const base64 = btoa(String.fromCodePoint(...bytes))
  // Make sure it is url safe
  return base64.replace(/\+/g, '-')
               .replace(/\//g, '_')
               .replace(/\=+$/, '')
}

export function base64Decode(str) {
  let base64 = str.replace(/-/g, '+')
                    .replace(/_/g, '/')
  while (base64.length % 4 != 0) {
    base64 += '='
  }
  return new Uint8Array(Array.from(atob(base64), s=> s.codePointAt(0) ?? 0))
}

export async function sign(actorClient, message) {
    const messageString = stringify(message)
    const messageBytes = new TextEncoder().encode(messageString)

    const signatureBytes = await actorClient.sign(messageBytes)
    const signatureString = base64Encode(signatureBytes)

    const publicKey = await actorClient.getPublicKey()
    const publicKeyString = base64Encode(publicKey)
    actor = 'actor:' + publicKeyString

    const signature = stringify({
      messageString,
      signatureString,
      actor
    })

    return signature
}

export async function verify(actorClient, signature) {
  const { signatureString, messageString, actor } = JSON.parse(signature)

  const payload = JSON.parse(messageString)

  const signatureBytes = base64Decode(signatureString)
  const publicKeyString = actor.slice(6)
  const publicKey = base64Decode(publicKeyString)
  const messageBytes = new TextEncoder().encode(messageString)
  if (!await actorClient.verify(signatureBytes, messageBytes, publicKey)) {
    "bad actor"
  }

  return { actor, payload }
}