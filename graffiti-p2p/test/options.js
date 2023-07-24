// import ActorManager from "../src/actor-manager"

export default async function options() {
  // const actorManager = new ActorManager()
  // await actorManager.createActor(crypto.randomUUID())
  const me = crypto.randomUUID()

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
    // mock the actor manager
    actorManager: {
      me,
      async sign(payload, actor) {
        actor = actor?actor:me
        if (actor != me)
          throw "Can't sign if not you."
        return { payload, actor }
      },
      async verify({ payload, actor }) {
        return { payload, actor }
      }
    }
  }
}