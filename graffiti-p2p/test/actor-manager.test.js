import { describe, expect, it } from 'vitest'
import ActorManager from '../src/actor-manager'
import { randomHash } from '../src/util'

describe('Actor Manager', ()=> {

  it('create account and sign', async ()=> {
    const am = new ActorManager()
    const actorOriginal = await am.createActor(await randomHash())

    const input = {
      hello: "world",
      something: 1234
    }
    const signed = await am.sign(input)
    const { payload, actor } = await am.verify(signed)

    expect(actor).to.equal(actorOriginal)
    for (const key in input) {
      expect(payload[key]).to.equal(input[key])
    }

  }, 100000)
})