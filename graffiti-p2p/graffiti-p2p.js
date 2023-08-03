import P2PWrapper from "./src/p2p-wrapper"
import ActorClient from '@graffiti-garden/actor-client'
import GraffitiObject from './src/object'
import GraffitiContext from './src/context'
import { randomHash } from "./src/util"

// TODO:
// - Make webauthn experience smoother - why does it not ask for password on monitor??
// - store stuff in IDB
// - make an actual demo
// - tracker client reconnect
// - mirror
// - Private messaging
// - optimization?

export default class Graffiti {
  constructor(options) {
    this.actorClient = new ActorClient(options.actorManager)
    this.wrapper = new P2PWrapper(this.actorClient, options)
    this.objectContainer = options.objectContainer
  }

  async selectActor() {
    return await this.actorClient.selectActor()
  }

  async post(value, actor) {
    const object = this.wrapper.get(GraffitiObject, actor, await randomHash(), this.objectContainer)
    return await object.apply(o=>Object.assign(o,value)).post()
  }

  async edit(post, func) {
    const object = this.wrapper.get(GraffitiObject, post.actor, post.path, this.objectContainer)
    return await object.apply(func).post()
  }

  async delete(post) {
    const object = this.wrapper.get(GraffitiObject, post.actor, post.path, this.objectContainer)
    await object.delete()
  }

  context(path) {
    return this.wrapper.get(GraffitiContext, path, this.objectContainer)
  }
}