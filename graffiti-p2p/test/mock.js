export function actorClientMock() {
  const me = 'actor:'+crypto.randomUUID()

  const actorClient = {
    async sign(payload, actor) {
      if (actor != me) throw "this is not u"
      return JSON.stringify({ payload, actor })
    },

    async verify(signed) {
      return JSON.parse(signed)
    }
  }

  return {actor: me, actorClient}
}