import routeMessage, { signaturePayloadValidate } from './links-from-messaging'
import { sha256Hex } from './util'

export default function (actorClient) {

  return class LinksFrom {
    constructor(source) {
      this.source = source
      this.callbacks = new Set()
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

    addListener(callback) {
      // Call the function with all existing data
      for (const [id, { actor, target, targetHash, salt, deleted }] of Object.entries(this.have)) {
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

      const id = await this.#makeID(source, targetHash, salt, actor)

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