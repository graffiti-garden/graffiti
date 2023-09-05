import P2PWrapper from "./src/p2p-wrapper"
import ActorClient from '@graffiti-garden/actor-client'
import GraffitiObject from './src/object'
import GraffitiContext from './src/context'
import { randomHash } from "./src/util"
import { createStore, entries, del } from "idb-keyval"
import PostArray from './src/posts'

  ///////
// - optimization
//   - only send stuff (esp. big stuff like images) if other person *doesn't* have it
//   - don't block when sending stuff to peers
  ///////

export { PostArray }

export default class Graffiti {
  constructor(options={}) {
    this.actorClient = new ActorClient(options.actorManager)
    this.wrapper = new P2PWrapper(this.actorClient, options)
    this.objectContainer = options.objectContainer

    this.meContainer = options.objectContainer?
      options.objectContainer() : {}
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
      for (const [id, {actor, path, signed}] of existingObjects) {
        try {
          const object = this.wrapper.get(GraffitiObject, actor, path, this.objectContainer)
          object.onMessage(null, signed)
        } catch {
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
  }

  async post(value, actor) {
    actor=actor?? this.me
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

  async * posts(contextPath, signal) {
    if (contextPath) {
      const context = this.wrapper.get(
        GraffitiContext,
        contextPath,
        this.objectContainer)
      yield * context.posts(signal)
    } else {
      await new Promise((resolve, reject)=> {
        if (signal) {
          signal.addEventListener(
            "abort",
            ()=> reject(signal.reason),
            { once: true, passive: true }
          )
        } else {
          throw "No context."
        }
      })
    }
  }
}
