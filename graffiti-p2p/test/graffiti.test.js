import { describe, expect, it } from 'vitest'
import { randomHash } from "../src/util"
import Graffiti from "../graffiti-p2p"

describe('Context', async ()=> {

  it('basic context properties', async ()=> {

    const gf = new Graffiti()
    await gf.createActor(await randomHash())

    const object = await gf.post({
      something: "hello"
    })
    expect(object.something).to.equal("hello")

    const contextPath = await randomHash()
    const context = gf.context(contextPath)
    await context.add(object)

    expect(context.posts().length).to.equal(1)
    expect(context.posts()[0].something).to.equal("hello")

    const gf2 = new Graffiti()
    await gf2.createActor(await randomHash())
    const context2 = gf.context(contextPath)

    await new Promise(r=> setTimeout(r, 1000));
    expect(context2.posts().length).to.equal(1)
    expect(context2.posts()[0].something).to.equal("hello")

    await context.delete(object)
    expect(context.posts().length).to.equal(0)

    await new Promise(r=> setTimeout(r, 1000));
    expect(context2.posts().length).to.equal(0)
  }, 20000)
})