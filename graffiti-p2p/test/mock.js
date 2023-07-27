export function actorClientMock() {
  const me = crypto.randomUUID()

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


export const options = {
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
  }
}