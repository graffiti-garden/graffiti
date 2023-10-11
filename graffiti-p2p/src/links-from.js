import routeMessage, { signaturePayloadValidate } from './links-from-messaging'
import { sha256Hex } from './util'
import { createStore as createStoreDB, set as setDB, get as getDB, entries as entriesDB } from "idb-keyval"

export default function (actorClient, noStorage=false) {

  const store = {}
  const createStore = noStorage? ()=> {} : createStoreDB
  const entries = noStorage? ()=> Object.entries(store) : entriesDB
  const get =  noStorage? id=> id in store? store[id] : null : getDB
  const set = noStorage? (id, value)=> store[id] = value : setDB

  return class LinksFrom {
    constructor(source) {
      this.source = source
      this.callbacks = new Set()
      this.linkStore = createStore('graffiti:' + this.source, 'links')
    }

    static toURI(source) { return source }

    async createPostCapability(target, actor) {
      const targetHash = await sha256Hex(JSON.stringify(target))
      const salt = crypto.randomUUID()
      return await this.#createCapability(targetHash, salt, actor, false, target)
    }

    async createDeleteCapability(targetHash, salt, actor) {
      return await this.#createCapability(targetHash, salt, actor, true)
    }

    async useCapability({ link, signature }, verified=false) {
      if (!verified) {
        const { payload, actor } = await actorClient.verify(signature)

        if (
          !signaturePayloadValidate(payload) ||
          link.actor != actor ||
          link.source != this.source ||
          link.source != payload.source ||
          link.targetHash != payload.targetHash ||
          link.salt != payload.salt ||
          link.deleted != payload.deleted || (
            !link.deleted &&
            link.targetHash != await sha256Hex(JSON.stringify(link.target))
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
      const linkEntries = await entries(this.linkStore)

      for (const [id, { actor, target, targetHash, salt, deleted }] of linkEntries) {
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
      const linkEntries = await entries(this.linkStore)
      const links = linkEntries.map(
        ([id, { deleted }])=> [id, deleted]
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
      return await sha256Hex(JSON.stringify({
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
      const linkEntries = await entries(this.linkStore)
      const wanted = 
        Object.entries(links)
              .filter(
                ([ id, deleted ]) =>
                  // We have not seen the id before
                  !(id in linkEntries) ||
                  // Or we have, but is is not deleted...
                  (!linkEntries[id].deleted &&
                  // and the incoming message is a deletion
                    deleted)
                )
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
      if (source != this.source)
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