import P2PWrapper from "./src/p2p-wrapper"
import ActorClient from '@graffiti-garden/actor-client'
import GraffitiObject from './src/object'
import GraffitiContext from "./src/context"
import { randomHash } from "./src/util"
import { createStore, entries, del } from "idb-keyval"
import PostArray from './src/posts'

///////
// - optimization
//   - only send stuff (esp. big stuff like images) if other person *doesn't* have it
//   - limit what is seeded...
///////

export { PostArray }

export default class Graffiti {
  constructor(options={}) {
    this.actorClient = new ActorClient(options.actorManager)
    this.wrapper = new P2PWrapper(this.actorClient, options)
    this.objectContainer = options.objectContainer

    this.meContainer = options.meContainer?? {}
    this.meContainer.value = null

    const fetchMe = ()=>
      this.meContainer.value = localStorage.getItem("graffiti-me")
    if (this.actorClient.initialized) {
      fetchMe()
    } else {
      this.actorClient.initializeEvents.addEventListener(
        "initialized",
        fetchMe,
        { once: true, passive: true }
      )
    }

    const objectStore = createStore('graffiti', 'objects')
    entries(objectStore).then(existingObjects=> {
      for (const [id, {verified, signed}] of existingObjects) {
        try {
          const object = this.wrapper.get(GraffitiObject, verified.actor, verified.path, this.objectContainer)
          object.onVerified(verified, signed)
        } catch(e) {
          console.error(e)
          del(id, objectStore)
        }
      }
    })
  }

  get me() {
    return this.meContainer.value
  }

  async selectActor() {
    const me = await this.actorClient.selectActor()
    localStorage.setItem("graffiti-me", me)
    this.meContainer.value = me
    return me
  }

  // Alias
  async logIn() { return await this.selectActor() }
  async logOut() {
    localStorage.removeItem("graffiti-me")
    this.meContainer.value = null
    return null
  }

  openWrapper({ actor, path }) {
    return this.wrapper.get(GraffitiObject, actor, path, this.objectContainer)
  }

  open(post) {
    return this.openWrapper(post).value
  }

  async post(value, actor) {
    return await this.openWrapper({
      actor: actor?? this.me,
      path: await randomHash()
    }).post(o=>Object.assign(o,value))
  }

  async edit(post, func) {
    return await this.openWrapper(post).post(func)
  }

  async delete(...posts) {
    await Promise.all(posts.map(p=>this.openWrapper(p).delete()))
  }

  subscribe(...contexts) {
    contexts.forEach(context=>
      this.wrapper.get(GraffitiContext, context, this.objectContainer)
    )
  }
}