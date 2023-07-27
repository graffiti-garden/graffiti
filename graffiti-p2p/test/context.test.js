import { describe, expect, it } from 'vitest'
import { options, actorClientMock } from './mock'
import P2PWrapper from "../src/p2p-wrapper"
import GraffitiContext from "../src/context"
import GraffitiObject from '../src/object'
import { randomHash } from '../src/util'

const timeout = 20000

describe('Context', async ()=> {

  const { actor: actor1, actorClient: actorClient1 } = actorClientMock()
  const { actor: actor2, actorClient: actorClient2 } = actorClientMock()
  const pw1 = new P2PWrapper(actorClient1, options)
  const pw2 = new P2PWrapper(actorClient2, options)

  it('basic context properties', async ()=> {
    const path = await randomHash()
    const context = pw1.get(GraffitiContext, path)

    // Objects starts off empty
    expect(context.posts()).toBeInstanceOf(Array)
    expect(context.posts().length).to.equal(0)

    // Add an object
    const objectWrapped = pw1.get(GraffitiObject, actor1, await randomHash())
    await context.add(objectWrapped.value)
    expect(context.posts().length).to.equal(1)
    expect(context.posts()[0].id).to.equal(objectWrapped.value.id)

    // Delete an object
    await context.delete(objectWrapped.value)
    expect(context.posts().length).to.equal(0)
  }, timeout)

  it('adding someone else\'s object', async()=> {
    const path = await randomHash()
    const context = pw1.get(GraffitiContext, path)

    const objectWrapped = pw1.get(GraffitiObject, actor2, await randomHash())

    // Cannot add someone else's object
    expect(context.add(objectWrapped.value)).rejects.toThrowError()
  }, timeout)

  it('adding and removing object in remote context', async()=> {
    const contextPath = await randomHash()

    const context1 = pw1.get(GraffitiContext, contextPath)
    const context2 = pw2.get(GraffitiContext, contextPath)

    const objectWrapped = pw1.get(GraffitiObject, actor1, await randomHash())
    objectWrapped.value.something = "1234"

    await context1.add(objectWrapped.value)

    // Wait for context to propogate
    await new Promise(r=> setTimeout(r, 1000));
    expect(context2.posts().length).to.equal(1)

    // Wait for the object content to propogate
    await new Promise(r=> setTimeout(r, 1000));
    expect(context2.posts()[0].something).to.equal("1234")

    // Delete from the context
    await context1.delete(objectWrapped.value)
    await new Promise(r=> setTimeout(r, 1000));
    expect(context2.posts().length).to.equal(0)
  }, timeout)
})