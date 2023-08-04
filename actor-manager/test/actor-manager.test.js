import { describe, expect, it, vi } from 'vitest'
import ActorManager from '../src/actor-manager'

describe('Actor Manager', ()=> {
  it('create account and sign', async ()=> {
    const am = new ActorManager()
    const actorOriginal = await am.createActor(crypto.randomUUID())

    const input = {
      hello: "world",
      something: 1234
    }
    vi.spyOn(window, "confirm").mockReturnValue(true)
    const signed = await am.sign(input, actorOriginal)
    const { payload, actor } = await am.verify(signed)

    expect(actor).to.equal(actorOriginal)
    for (const key in input) {
      expect(payload[key]).to.equal(input[key])
    }
  })

  it('sign with nonexistant account', async ()=> {
    const am = new ActorManager()

    vi.spyOn(window, "confirm").mockReturnValue(true)
    expect(am.sign({test: "something"}, crypto.randomUUID())).rejects.toThrowError()
  })

  it('Signing with invalid user confirmation', async ()=> {
    const am = new ActorManager()
    const actorOriginal = await am.createActor(crypto.randomUUID())

    vi.spyOn(window, "confirm").mockReturnValue(false)
    expect(am.sign({}, actorOriginal)).rejects.toThrowError()
  })

  it('Access, rename and delete', async ()=> {
    const am = new ActorManager()
    expect(Object.keys(am.actors).length).to.equal(0)

    const nickname1 = crypto.randomUUID()
    const actor1 = await am.createActor(nickname1)
    expect(am.actors).toHaveProperty(actor1)
    expect(am.actors[actor1].nickname).to.equal(nickname1)

    const nickname2 = crypto.randomUUID()
    await am.renameActor(actor1, nickname2)
    expect(am.actors).toHaveProperty(actor1)
    expect(am.actors[actor1].nickname).to.equal(nickname2)

    // Delete without confirmation
    vi.spyOn(window, "confirm").mockReturnValue(false)
    expect(am.deleteActor(actor1)).rejects.toThrowError()
    expect(am.actors).toHaveProperty(actor1)

    vi.spyOn(window, "confirm").mockReturnValue(true)
    await am.deleteActor(actor1)
    expect(am.actors).not.toHaveProperty(actor1)

    expect(am.deleteActor(actor1)).rejects.toThrowError()
  })

  it('Local storage actor', async ()=> {
    const am1 = new ActorManager()
    const nickname1 = crypto.randomUUID()
    const actor1 = await am1.createActor(nickname1)

    const am2 = new ActorManager()
    await am2.initialize()
    expect(am2.actors).toHaveProperty(actor1)
    expect(am2.actors[actor1].nickname).to.equal(nickname1)

    vi.spyOn(window, "confirm").mockReturnValue(true)
    await am2.deleteActor(actor1)
    const am3 = new ActorManager()
    await am3.initialize()
    expect(am3.actors).not.toHaveProperty(actor1)
  })

  it('Backchannel actor', async ()=> {
    const am1 = new ActorManager()
    const am2 = new ActorManager()
    await am1.initialize()
    await am2.initialize()

    const nickname1 = crypto.randomUUID()
    const actor1 = await am1.createActor(nickname1)

    await new Promise(r=> setTimeout(r, 100));
    expect(am2.actors).toHaveProperty(actor1)

    vi.spyOn(window, "confirm").mockReturnValue(true)
    await am2.deleteActor(actor1)
    expect(am2.actors).not.toHaveProperty(actor1)

    await new Promise(r=> setTimeout(r, 100));
    expect(am1.actors).not.toHaveProperty(actor1)
  })

  it('sign with deleted account', async ()=> {
    const am1 = new ActorManager()
    const actor1 = await am1.createActor(crypto.randomUUID())

    const am2 = new ActorManager()
    await am2.initialize()
    vi.spyOn(window, "confirm").mockReturnValue(true)
    await am2.deleteActor(actor1)

    expect(am2.sign({}, actor1)).rejects.toThrowError()
    await new Promise(r=> setTimeout(r, 100));
    expect(am1.sign({}, actor1)).rejects.toThrowError()
  })
})