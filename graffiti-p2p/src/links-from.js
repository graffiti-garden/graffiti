import routeMessage, { signaturePayloadValidate } from './links-from-messaging'
import { sha256Hex } from './util'
import { createStore as createStoreDB, set as setDB, get as getDB, keys as keysDB } from "idb-keyval"
import * as stringify from 'fast-json-stable-stringify'

export default function (actorClient, noStorage=false) {

  const store = {}
  const createStore = noStorage? ()=> {} : createStoreDB
  const keys = noStorage? ()=> Object.keys(store) : keysDB
  const get =  noStorage? id=> id in store? store[id] : null : getDB
  const set = noStorage? (id, value)=> store[id] = value : setDB

  return class LinksFrom {
    static toURI(source) {
      return stringify(source)
    }

    constructor(source) {
      this.source = source
      this.sourceURI = this.constructor.toURI(source)
      this.callbacks = new Set()
      this.linkStore = createStore('graffiti:' + this.sourceURI, 'links')
    }

    async createPostCapability(target, actor) {
      const targetHash = await sha256Hex(stringify(target))
      const salt = crypto.randomUUID()
      return await this.#createCapability(targetHash, salt, actor, false, target)
    }

    async createDeleteCapability(targetHash, salt, actor) {
      return await this.#createCapability(targetHash, salt, actor, true)
    }

    async useCapability({ link, signature }, verified=false) {
      if (!verified) {
        const { payload, actor } = await actorClient.verify(signature)

        const sourceURI = this.constructor.toURI(link.source)
        if (
          !signaturePayloadValidate(payload) ||
          link.actor != actor ||
          sourceURI != this.sourceURI ||
          sourceURI != this.constructor.toURI(payload.source) ||
          link.targetHash != payload.targetHash ||
          link.salt != payload.salt ||
          link.deleted != payload.deleted || (
            !link.deleted &&
            link.targetHash != await sha256Hex(stringify(link.target))
          )
        ) {
          throw "Capability signature does not match link"
        }
      }

      const { deleted, target } = link

      await this.onMessage(null,
        this.#constructGiveMessage({ signature, deleted, target })
      )

      return link
    }

    async addListener(callback) {
      // Call the function with all existing data
      const linkIds = await keys(this.linkStore)

      for (const id of linkIds) {
        const { actor, target, targetHash, salt, deleted } = await get(id, this.linkStore)

        if (!deleted) {
          callback({
            id,
            source: this.source,
            actor,
            targetHash,
            target,
            salt,
            deleted
          })
        }
      }

      this.callbacks.add(callback)
    }

    removeListener(callback) {
      this.callbacks.delete(callback)
    }
    
    async onAnnounce(peer) {
      const linkIds = await keys(this.linkStore)
      const links = await Promise.all(
        linkIds.map(
          async id=> [id, (await get(id, this.linkStore)).deleted]
        )
      )
      if (links.length) {
        await this.send(peer, {
          intent: 'have',
          links: Object.fromEntries(links)
        })
      }
    }

    async onMessage(peer, message) {
      await routeMessage(
        message,
        this.#onHave.bind(this, peer),
        this.#onWant.bind(this, peer),
        this.#onGive.bind(this),
        actorClient
      )
    }
    async #makeID(source, targetHash, salt, actor) {
      return await sha256Hex(stringify({
        source, targetHash, salt, actor
      }))
    }

    #constructGiveMessage({ signature, deleted, target }) {
      const output = {
        intent: 'give',
        signature
      }
      if (!deleted) {
        output.target = target
      } 
      return output
    }

    async #onHave(peer, links) {
      const wanted = (await Promise.all(
        Object.entries(links).map(async ([id, deleted])=> {
          const entry = await get(id, this.linkStore)
          // We have not seen the id before
          // Or we have, but is is not deleted...
          // and the incoming message is a deletion
          return (!entry || (!entry.deleted && deleted))?
            [id, deleted] : null
        })
      )).filter(a=>a)
      if (wanted.length) {
        await this.send(peer, {
          intent: 'want',
          links: Object.fromEntries(wanted)
        })
      }
    }

    async #onWant(peer, links) {
      await Promise.all(Object.entries(links).map(
        async ([ id, deleted ])=> {
          const entry = await get(id, this.linkStore)
          if (
            // If we have the wanted link and
            entry &&
            // and either we have a deletion
            // or they are not looking for a deletion
            ( entry.deleted || !deleted )) {

            await this.send(peer, this.#constructGiveMessage(entry))
          }
        }
      ))
    }

    async #onGive({
      source,
      target,
      targetHash,
      salt,
      actor,
      deleted,
      signature
    }) {
      if (this.constructor.toURI(source) != this.sourceURI)
        throw "Source in message does not match"

      const id = await this.#makeID(source, targetHash, salt, actor)

      const entry = await get(id, this.linkStore)
      if (entry &&
          (entry.deleted || !deleted))
        throw "Not a new message!"

      await set(id, { targetHash, salt, actor, deleted, target, signature }, this.linkStore)

      // Only include the target if not deleted
      const output = { source: this.source, actor, targetHash, salt, deleted, id }
      if (!deleted) output.target = target

      this.callbacks.forEach(cb=> cb(output))

      this.gossip? await this.gossip({ intent: 'have', links: {[id]: deleted} }) : null
    }

    async #createCapability(targetHash, salt, actor, deleted, target) {
      const signature = await actorClient.sign({
        source: this.source,
        targetHash,
        salt,
        deleted
      }, actor)

      const link = {
        id: await this.#makeID(this.source, targetHash, salt, actor),
        source: this.source,
        actor,
        targetHash,
        salt,
        deleted
      }

      if (!deleted) {
        link.target = target
      }

      return { signature, link }
    }
  }
}