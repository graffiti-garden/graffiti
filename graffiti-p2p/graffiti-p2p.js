import P2PWrapper from "./src/p2p-wrapper"
import ActorClient from '@graffiti-garden/actor-client'
import GraffitiObject from './src/object'
import GraffitiContext from './src/context'
import { randomHash } from "./src/util"

// TODO:

// const obj = gf.create(actor, value)
// .set("x", "y")
// .addContext(`actor:${actor}`)
// .addContext(`tag:stuff`) // If you just have access to one context you shouldn't be able to see the others
// .post() // sign and gossip over object channel and all context channels

// obj.x = "y"

// gf.modify(obj)
// .set("x", "y")
// .set(o=>o.x.y.z, "qwerty")
// .removeContext("stuff")
// .addContext("somethingElse")
// .post()

// gf.delete(obj) // deletes all properties and removes from all contexts, no post required

// const { posts } = gf.useContext(`actor:${actor}`)

// - store stuff in IDB
// - make an actual demo
// - mirror

// - efficiency?
//   - when to seed stuff?
//   - when to clear key cache?

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
    await object.set(value)
    return object.value
  }

  context(path) {
    return this.wrapper.get(GraffitiContext, path, this.objectContainer)
  }
}