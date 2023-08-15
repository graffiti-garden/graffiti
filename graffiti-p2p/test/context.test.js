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

  it('existing contexts', async()=> {
    const contextPath = await randomHash()
    const context1 = pw1.get(GraffitiContext, contextPath)
    const context2 = pw2.get(GraffitiContext, contextPath)

    const objectWrapped = pw1.get(GraffitiObject, actor1, await randomHash())
    await objectWrapped.apply(o=> {
      o.hi = "hello",
      o.context = [contextPath]
    }).post()

    const result1 = (await context1.posts(AbortSignal.timeout(500)).next()).value
    expect(result1.action).to.equal("add")
    expect(result1.value.hi).to.equal("hello")

    const result2 = (await context2.posts(AbortSignal.timeout(500)).next()).value
    await new Promise(r=> setTimeout(r, 1000));
    expect(result2.action).to.equal("add")
    expect(result2.value.hi).to.equal("hello")

    await objectWrapped.delete()
    expect(context1.posts(AbortSignal.timeout(500)).next()).rejects.toThrowError()

    await new Promise(r=> setTimeout(r, 1000));
    expect(context2.posts(AbortSignal.timeout(500)).next()).rejects.toThrowError()
  })

  it('implicitly set context', async()=> {
    const contextPath = await randomHash()
    const context2 = pw2.get(GraffitiContext, contextPath)

    const object = pw1.get(GraffitiObject, actor1, await randomHash()).value
    object.context = [contextPath]

    await new Promise(r=> setTimeout(r, 1000));

    const result2 = (await context2.posts(AbortSignal.timeout(500)).next()).value
    expect(result2.action).to.equal("add")
    expect(result2.value.id).to.equal(object.id)
  })

  it('set the context to something bad', async()=> {
    const objectWrapper = pw1.get(GraffitiObject, actor1, await randomHash())
    const object = objectWrapper.value

    object.context = [1234]
    await new Promise(r=> setTimeout(r, 1000));
    expect(object.context).toBeUndefined()

    object.context = ["123434"]
    await new Promise(r=> setTimeout(r, 1000));
    expect(object.context[0]).to.equal("123434")

    expect(objectWrapper.apply(o=> o.context.push(1234)).post()).rejects.toThrowError()
    await new Promise(r=> setTimeout(r, 1000));
    expect(object.context.length).to.equal(1)
  })

  // Multiple contexts
})