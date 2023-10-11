import ActorClient from '@graffiti-garden/actor-client'
import P2PWrapper from "./src/p2p-wrapper"
import linksFrom from './src/links-from'

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

  async createPostLinkCapability(source, target, actor) {
    actor = actor?? this.me
    return await this.#newLinksFrom(source).createPostCapability(target, actor)
  }

  async createDeleteLinkCapability({ source, targetHash, salt, actor }) {
    return await this.#newLinksFrom(source).createDeleteCapability(targetHash, salt, actor)
  }

  async useLinkCapability(capability) {
    return await this.#newLinksFrom(capability.link.source).useCapability(capability)
  }

  async postLink(source, target, actor) {
    return await this.useLinkCapability(
      await this.createPostLinkCapability(source, target, actor)
    )
  }

  async deleteLink({ source, targetHash, salt, actor }) {
    return await this.useLinkCapability(
      await this.createDeleteLinkCapability({ source, targetHash, salt, actor })
    )
  }

  addLinkListener(source, f) {
    this.#newLinksFrom(source).addListener(f)
  }

  removeLinkListener(source, f) {
    this.#newLinksFrom(source).removeListener(f)
  }
}