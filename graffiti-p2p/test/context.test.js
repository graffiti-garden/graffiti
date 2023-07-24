import { describe, expect, it } from 'vitest'
import options from './options'
import P2PWrapper from "../src/p2p-wrapper"
import GraffitiContext from "../src/context"
import GraffitiObject from '../src/object'
import { randomHash } from '../src/util'

const timeout = 20000

describe('Context', async ()=> {

  const options1 = await options()
  const options2 = await options()

  it('basic context properties', async ()=> {
    const pw = new P2PWrapper(options1)

    const path = await randomHash()
    const context = pw.get(GraffitiContext, path)

    // Objects starts off empty
    expect(context.posts()).toBeInstanceOf(Array)
    expect(context.posts().length).to.equal(0)

    // Add an object
    const objectWrapped = pw.get(GraffitiObject, pw.options.actorManager.me, await randomHash())
    await context.add(objectWrapped.value)
    expect(context.posts().length).to.equal(1)
    expect(context.posts()[0].id).to.equal(objectWrapped.value.id)

    // Delete an object
    await context.delete(objectWrapped.value)
    expect(context.posts().length).to.equal(0)
  }, timeout)

  it('adding someone else\'s object', async()=> {
    const pw1 = new P2PWrapper(options1)
    const path = await randomHash()
    const context = pw1.get(GraffitiContext, path)

    const objectWrapped = pw1.get(GraffitiObject, await randomHash(), await randomHash())

    // Cannot add someone else's object
    expect(context.add(objectWrapped.value)).rejects.toThrowError()
  }, timeout)

  it('adding and removing object in remote context', async()=> {
    const contextPath = await randomHash()

    const pw1 = new P2PWrapper(options1)
    const context1 = pw1.get(GraffitiContext, contextPath)
    const pw2 = new P2PWrapper(options2)
    const context2 = pw2.get(GraffitiContext, contextPath)

    const objectWrapped = pw1.get(GraffitiObject, pw1.options.actorManager.me, await randomHash())
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