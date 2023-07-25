import P2PWrapper from "./src/p2p-wrapper"
import ActorManager from './src/actor-manager'
import GraffitiObject from './src/object'
import GraffitiContext from './src/context'
import { randomHash } from "./src/util"

// TODO:
// refactor object and context so that it works with reactivity
// - store stuff in IDB
// - mirrors
// - make an actual demo
// don't seed things that have zero stuff

export default class Graffiti {
  constructor(options) {
    this.actorManager = new ActorManager(options),
    options = {
      trackers: ["wss://tracker.graffiti.garden"],
      peerjs: {
        host: "peerjs.graffiti.garden",
        secure: true
      },
      actorManager: this.actorManager,
      ...options
    }

    this.wrapper = new P2PWrapper(options)
  }

  async createActor(name) {
    return await this.actorManager.createActor(name)
  }

  async selectActor() {
    return await this.actorManager.selectActor()
  }

  get me() {
    return this.actorManager.me
  }

  async post(value) {
    const object = this.wrapper.get(GraffitiObject, this.me, await randomHash())
    await object.set(value)
    return object.value
  }

  context(path) {
    return this.wrapper.get(GraffitiContext, path)
  }
}