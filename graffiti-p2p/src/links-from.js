import routeMessage from './links-from-messaging'
import { sha256Hex } from './util'

export default function (actorClient) {

  return class LinksFrom {
    constructor(source) {
      this.source = source
      this.callbacks = new Set()

      // id (actor + targetHash + salt) ->
      // { actor, target, targetHash, salt, deleted, actor, signature }
      // TODO: put the target (+signature?) into storage
      this.have = {}
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

    async useCapability(capability) {
      await this.onMessage(null, capability)
    }

    addListener(callback) {
      // Call the function with all existing data
      for (const { actor, target, targetHash, salt, deleted } of Object.values(this.have)) {
        if (!deleted) {
          callback({
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
      const links = Object.entries(this.have).map(
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
      const wanted = 
        Object.entries(links)
              .filter(
                ([ id, deleted ]) =>
                  // We have not seen the id before
                  !(id in this.have) ||
                  // Or we have, but is is not deleted...
                  (!this.have[id].deleted &&
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
          if (
            // If we have the wanted link and
            id in this.have &&
            // and either we have a deletion
            // or they are not looking for a deletion
            ( this.have[id].deleted || !deleted )) {

            await this.send(peer, this.#constructGiveMessage(this.have[id]))
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

      const id = actor+targetHash+salt
      if (id in this.have &&
          (this.have[id].deleted || !deleted))
        throw "Not a new message!"

      this.have[id] = {
        target,
        targetHash,
        salt,
        actor,
        deleted,
        signature
      }

      // Only include the target if not deleted
      const output = { source: this.source, actor, target, targetHash, salt, deleted }
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

      return this.#constructGiveMessage({signature, deleted, target})
    }
  }
}