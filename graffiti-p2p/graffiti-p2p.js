import ActorClient from '@graffiti-garden/actor-client'
import P2PWrapper from "./src/p2p-wrapper"
import linksFrom from './src/links-from'

// TODO:
// - give links IDs
// - make link capabilities more transparent
//   - capability = { link, signature }
//   - link = { source, target, actor, deleted, targetHash, salt, id }
// - save things to "disk"

export default class Graffiti {
  #actorClient; #wrapper; #LinksFrom; #meCallbacks;

  constructor(options={}) {
    this.#actorClient = new ActorClient(options.actorManager)
    this.#wrapper = new P2PWrapper(options)
    this.#LinksFrom = linksFrom(this.#actorClient)

    this.#meCallbacks = new Set()
    const fetchMe = ()=> {
      this.me = localStorage.getItem("graffiti-me")
      this.#meCallbacks.forEach(f=> f(this.me))
    }
    if (this.#actorClient.initialized) {
      fetchMe()
    } else {
      this.#actorClient.initializeEvents.addEventListener(
        "initialized",
        fetchMe,
        { once: true, passive: true }
      )
    }
  }

  async logIn() {
    this.me = await this.#actorClient.selectActor()
    localStorage.setItem("graffiti-me", this.me)
    this.#meCallbacks.forEach(f=> f(this.me))
    return this.me
  }
  async logOut() {
    localStorage.removeItem("graffiti-me")
    this.me = null
    this.#meCallbacks.forEach(f=> f(this.me))
    return null
  }
  addMeListener(f) {
    if (this.me) f(this.me)
    this.#meCallbacks.add(f)
  }
  removeMeListener(f) {
    this.#meCallbacks.delete(f)
  }

  #newLinksFrom(source) {
    return this.#wrapper.get(this.#LinksFrom, source)
  }

  async createPostCapability(source, target, actor) {
    actor = actor?? this.me
    return await this.#newLinksFrom(source).createPostCapability(target, actor)
  }

  async createDeleteCapability({ source, targetHash, salt, actor }) {
    return await this.#newLinksFrom(source).createDeleteCapability(targetHash, salt, actor)
  }

  async useCapability(source, capability) {
    return await this.#newLinksFrom(source).useCapability(capability)
  }

  async post(source, target, actor) {
    return await this.useCapability(
      source,
      await this.createPostCapability(source, target, actor)
    )
  }

  async delete({ source, targetHash, salt, actor }) {
    return await this.useCapability(
      source,
      await this.createDeleteCapability({ source, targetHash, salt, actor })
    )
  }

  addListener(source, f) {
    this.#newLinksFrom(source).addListener(f)
  }

  removeListener(source, f) {
    this.#newLinksFrom(source).removeListener(f)
  }
}

// import { createStore, entries, del } from "idb-keyval"
// const objectStore = createStore('graffiti', 'objects')
// entries(objectStore).then(existingObjects=> {
//   for (const [id, {verified, signed}] of existingObjects) {
//     try {
//       const object = this.wrapper.get(GraffitiObject, verified.actor, verified.path, this.objectContainer)
//       object.onVerified(verified, signed)
//     } catch(e) {
//       console.error(e)
//       del(id, objectStore)
//     }
//   }
// })