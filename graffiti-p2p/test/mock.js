import { base64Decode, base64Encode } from "../src/actor-client-wrapper"

export function actorClientMock() {
  const me = 'actor:'+crypto.randomUUID()

  const actorClient = {
    async sign(messageBytes) {
      return new TextEncoder().encode(JSON.stringify({
        messageString: base64Encode(messageBytes),
        actor: me
      }))
    },

    async verify(signatureBytes, messageBytes, publicKey) {
      const { messageString, actor } = JSON.parse(new TextDecoder().decode(signatureBytes))
      const messageBytes_ = base64Decode(messageString)

      if (new TextEncoder().encode(messageBytes) != new TextEncoder().encode(messageBytes_)) {
        return false
      }

      if (actor != 'actor:' + base64Encode(publicKey)) {
        return false
      }

      return true
    }
  }

  return {actor: me, actorClient}
}