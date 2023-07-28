import P2PWrapper from "./src/p2p-wrapper"
import ActorClient from '@graffiti-garden/actor-client'
import GraffitiObject from './src/object'
import GraffitiContext from './src/context'
import { randomHash } from "./src/util"

// TODO:
// Make sign only ask for a single authentication
// context+posts returned by usePosts. posts.add(), posts.delete()??
// make options cleaner

// - store stuff in IDB
// - make an actual demo
// - mirror

// - efficiency?
//   - when to seed stuff?
//   - when to clear key cache?

export default class Graffiti {
  constructor(options) {
    options = {
      actorManager: "https://actor.graffiti.garden",
      trackers: ["wss://tracker.graffiti.garden"],
      peerjs: {
        host: "peerjs.graffiti.garden",
        secure: true
      },
      ...options
    }

    this.actorClient = new ActorClient(options.actorManager)
    this.wrapper = new P2PWrapper(this.actorClient, options)
    this.objectContainer = options.objectContainer
  }

  async selectActor() {
    return await this.actorClient.selectActor()
  }

  async post(value, actor, container) {
    const object = this.wrapper.get(GraffitiObject, actor, await randomHash(), this.objectContainer)
    await object.set(value)
    return object.value
  }

  context(path) {
    return this.wrapper.get(GraffitiContext, path, this.objectContainer)
  }
}