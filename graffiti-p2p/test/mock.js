export function actorClientMock() {
  const me = 'actor:'+crypto.randomUUID()

  const actorClient = {
    async sign(payload, actor) {
      if (actor != me) throw "this is not u"
      return { payload, actor }
    },

    async verify({ payload, actor }) {
      return { payload, actor }
    }
  }

  return {actor: me, actorClient}
}