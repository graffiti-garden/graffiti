import ActorClient from '@graffiti-garden/actor-manager-client'
import P2PWrapper from "./src/p2p-wrapper"
import linksFrom from './src/links-from'

export default class Graffiti {
  #actorClient; #wrapper; #LinksFrom; #meCallbacks;

  constructor(options={}) {
    this.me = null
    this.#meCallbacks = new Set()
    this.#actorClient = new ActorClient(actor=> {
      this.me = actor
      this.#meCallbacks.forEach(f=> f(this.me))
    })
    this.#wrapper = new P2PWrapper(options)
    this.#LinksFrom = linksFrom(this.#actorClient)
  }

  logIn() {
    this.#actorClient.selectActor()
  }
  logOut() {
    this.#actorClient.selectActor()
  }
  addMeListener(f) {
    f(this.me)
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