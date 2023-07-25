import { describe, expect, it } from 'vitest'
import ActorManager from '../src/actor-manager'

describe('Actor Manager', ()=> {
  it('create account and sign', async ()=> {
    const am = new ActorManager()
    const actorOriginal = await am.createActor(crypto.randomUUID())

    const input = {
      hello: "world",
      something: 1234
    }
    const signed = await am.sign(input, actorOriginal)
    const { payload, actor } = await am.verify(signed)

    expect(actor).to.equal(actorOriginal)
    for (const key in input) {
      expect(payload[key]).to.equal(input[key])
    }
  }, 100000)

  it('sign with nonexistant account', async ()=> {
    const am = new ActorManager()

    expect(am.sign({test: "something"}, crypto.randomUUID())).rejects.toThrowError()
  })

  it('try verify with wrong account', async ()=> {
    const am = new ActorManager()
    const actor1 = await am.createActor(crypto.randomUUID())
    const actor2 = await am.createActor(crypto.randomUUID())

    const payload1 = {test: "something"}
    const payload2 = {test: "something else"}
    const signed1 = await am.sign(payload1, actor1)
    const signed2 = await am.sign(payload2, actor2)

    const { payload: payload1s, actor: actor1s } = await am.verify(signed1)
    const { payload: payload2s, actor: actor2s } = await am.verify(signed2)

    expect(actor1).to.equal(actor1s)
    expect(actor2).to.equal(actor2s)
    for (const key in payload1) {
      expect(payload1[key]).to.equal(payload1s[key])
    }
    for (const key in payload2) {
      expect(payload2[key]).to.equal(payload2s[key])
    }

    expect(am.verify({
      jwt:            signed1.jwt,
      authentication: signed1.authentication,
      credential:     signed2.credential
    })).rejects.toThrowError()

    expect(am.verify({
      jwt:            signed1.jwt,
      authentication: signed2.authentication,
      credential:     signed2.credential
    })).rejects.toThrowError()

    expect(am.verify({
      jwt:            signed2.jwt,
      authentication: signed1.authentication,
      credential:     signed2.credential
    })).rejects.toThrowError()
  }, 100000)
})