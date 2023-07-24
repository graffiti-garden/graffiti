import * as jose from 'jose'

export default async function options() {
  const alg = 'ES256'
  const { publicKey, privateKey } =
    await jose.generateKeyPair(alg, { extractable: true })
  const jwk = await jose.exportJWK(publicKey)

  return {
    // trackers: ["ws://localhost:8000"],
    trackers: ["wss://tracker.graffiti.garden"],
    // peerjs: {
    //   host: "localhost",
    //   ssl: false,
    //   port: "9000"
    // },
    peerjs: {
      host: "peerjs.graffiti.garden",
      secure: true
    },
    actor: {
      id: await jose.calculateJwkThumbprint(jwk),
      async signMessage(message) {
        return await new jose.SignJWT(message)
          .setProtectedHeader({ jwk, alg })
          .sign(privateKey)
      }
    }
  }
}