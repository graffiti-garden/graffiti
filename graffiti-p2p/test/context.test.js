import { describe, expect, it } from 'vitest'
import { actorClientMock } from './mock'
import P2PWrapper from "../src/p2p-wrapper"
import GraffitiContext from "../src/context"
import GraffitiObject from '../src/object'
import { randomHash } from '../src/util'

const timeout = 20000

describe('Context', async ()=> {

  const { actor: actor1, actorClient: actorClient1 } = actorClientMock()
  const { actor: actor2, actorClient: actorClient2 } = actorClientMock()
  const pw1 = new P2PWrapper(actorClient1)
  const pw2 = new P2PWrapper(actorClient1)

  it('basic context properties', async ()=> {
    const contextPath = await randomHash()
    const context = pw1.get(GraffitiContext, contextPath)

    // Posts starts off empty
    expect(context.posts(AbortSignal.timeout(500)).next()).rejects.toThrowError()

    // Add an object
    const objectWrapped = pw1.get(GraffitiObject, actor1, await randomHash())
    await objectWrapped.apply(o=> o.context = [contextPath]).post()
    const result = (await context.posts(AbortSignal.timeout(500)).next()).value
    expect(result.action).to.equal("add")
    expect(result.value.id).to.equal(objectWrapped.value.id)

    // // Delete an object
    await objectWrapped.apply(o=> o.context = []).post()
    expect(context.posts(AbortSignal.timeout(500)).next()).rejects.toThrowError()
  }, timeout)

  it('subscription in background', async()=> {
    const contextPath = await randomHash()
    const context1 = pw1.get(GraffitiContext, contextPath)

    let update = null
    async function listener() {
      for await (const postUpdate of context1.posts(AbortSignal.timeout(5000))) {
        update = postUpdate
      }
    }
    listener()

    const objectWrapped = pw2.get(GraffitiObject, actor1, await randomHash())
    await objectWrapped.apply(o=> {
      o.hello = "world"
      o.context = [contextPath]
    }).post()

    await new Promise(r=> setTimeout(r, 1000));
    expect(update.action).to.equal("add")
    expect(update.value.hello).to.equal("world")
    const hashURI = update.hashURI

    await objectWrapped.delete()

    await new Promise(r=> setTimeout(r, 1000));
    expect(update.action).to.equal("delete")
    expect(update.hashURI).to.equal(hashURI)
  })

  // Implicitly set context
  // Set an invalid context -> not an array, not a string, null, 
})