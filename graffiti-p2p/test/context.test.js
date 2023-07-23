import { describe, expect, it } from 'vitest'
import options from './options'
import P2PWrapper from "../src/p2p-wrapper"
import GraffitiContext from "../src/context"
import GraffitiObject from '../src/object'
import { randomHash } from '../src/util'

describe('Context', ()=> {

  it('basic context properties', async ()=> {
    const pw = new P2PWrapper(await options())

    const path = await randomHash()
    const context = pw.get(GraffitiContext, path)

    // Objects starts off empty
    expect(context.values()).toBeInstanceOf(Array)
    expect(context.values().length).to.equal(0)

    // Add an object
    const objectWrapped = pw.get(GraffitiObject, pw.options.actor.id, await randomHash())
    await context.add(objectWrapped.value)
    expect(context.values().length).to.equal(1)
    expect(context.values()[0].id).to.equal(objectWrapped.value.id)

    // Delete an object
    await context.delete(objectWrapped.value)
    expect(context.values().length).to.equal(0)
  })

  it('adding someone else\'s object', async()=> {
    const pw1 = new P2PWrapper(await options())
    const path = await randomHash()
    const context = pw1.get(GraffitiContext, path)

    const pw2 = new P2PWrapper(await options())
    const objectWrapped = pw2.get(GraffitiObject, pw2.options.actor.id, await randomHash())

    // Cannot add someone else's object
    expect(context.add(objectWrapped.value)).rejects.toThrowError()
  })

  it('adding and removing object in remote context', async()=> {
    const contextPath = await randomHash()

    const pw1 = new P2PWrapper(await options())
    const context1 = pw1.get(GraffitiContext, contextPath)
    const pw2 = new P2PWrapper(await options())
    const context2 = pw2.get(GraffitiContext, contextPath)

    const objectWrapped = pw1.get(GraffitiObject, pw1.options.actor.id, await randomHash())
    objectWrapped.value.something = "1234"

    await context1.add(objectWrapped.value)

    // Wait for context to propogate
    await new Promise(r=> setTimeout(r, 500));
    expect(context2.values().length).to.equal(1)

    // Wait for the object content to propogate
    await new Promise(r=> setTimeout(r, 500));
    expect(context2.values()[0].something).to.equal("1234")

    // Delete from the context
    await context1.delete(objectWrapped.value)
    await new Promise(r=> setTimeout(r, 500));
    expect(context2.values().length).to.equal(0)
  })
})