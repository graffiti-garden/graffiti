import { describe, it, assert, expect } from 'vitest'
import { actorClientMock } from './mock'
import routeMessage, { messageSchemaValidate, signaturePayloadValidate } from "../src/link-from-messaging"
import { sha256Hex } from '../src/util'

describe('Link messaging', async ()=> {

  const { actor, actorClient } = actorClientMock()

  for (const message of [
    { intent: 'have', clocks: { 'ksdjfkdjf': 1 } },
    { intent: 'want', clocks: { 'jfhjdhHFDJH-_34': -10, 'REIUIdjfh394': 3000 } },
    { intent: 'give', signature: '9493989', target: null },
    { intent: 'give', signature: 'asdkfjdk' },
    { intent: 'give', signature: 'kasjdfkjdkfjd', target: 'kdjfkj' },
    { intent: 'give', signature: 'ka434ufdhf', target: { something: 'sdkfj'} }
  ]) {
    it (`Valid message: ${JSON.stringify(message)}`, ()=> {
      assert(messageSchemaValidate(message))
    })
  }

  for (const message of [
    {},
    { clocks: { 'ksdjfkdjf': 1 } },
    { intent: 'aksjdfkj', clocks: { 'ksdjfkdjf': 1 } },
    { intent: 'have' },
    { intent: 'want' },
    { intent: 'give' },
    { intent: 'have', clocks: { 'ksdjfkdjf': 1 }, something: 'else' },
    { intent: 'want', clocks: {} },
    { intent: 'have', clocks: { '!!!': 1 } },
    { intent: 'have', clocks: { 'asdkfj': 0.1 } },
    { intent: 'have', clocks: { ['a'.repeat(400)]: 1 } },
    { intent: 'give', clocks: { 'askdfjkdj': 1 } },
    { intent: 'give', target: '' },
    { intent: 'give', signature: 1, target: '' }
  ]) {
    it (`Invalid message: ${JSON.stringify(message)}`, ()=> {
      assert(!messageSchemaValidate(message))
    })
  }

  it('have and want', ()=> {
    const clocks = {
      'kdjfkdjf': 42069
    } 
    let have = 0
    let want = 0
    const onHave = (cs)=>{
      expect(cs).toEqual(clocks)
      have++
    }
    const onWant = (cs)=>{
      expect(cs).toEqual(clocks)
      want++
    }

    routeMessage({ intent: 'have', clocks }, onHave, onWant)
    expect(have).toEqual(1)
    expect(want).toEqual(0)

    routeMessage({ intent: 'want', clocks }, onHave, onWant)
    expect(have).toEqual(1)
    expect(want).toEqual(1)
  })

  for (const payload of [
    { source: 'asdfjkdfj', targetHash: 'kdjfkdjf', isDelete: true, clock: 10}
  ]) {
    it (`Valid signature payload schema: ${JSON.stringify(payload)}`, ()=> {
      assert(signaturePayloadValidate(payload))
    })
  }

  for (const payload of [
    {},
    { source2: 'asdfjkdfj', targetHash: 'kdjfkdjf', isDelete: true, clock: 10},
    { targetHash: 'kdjfkdjf', isDelete: true, clock: 10},
    { source: 'asdfjkdfj', targetHash: 'kdjfkdjf', isDelete: null, clock: 10},
    { source: 'asdfjkdfj', targetHash: 'kdjfkdjf', isDelete: true, clock: 1.1},
    { source: 'asdfjkdfj', targetHash: 'kdjfkdjf', isDelete: true, clock: 10, something: 'else'}
  ]) {
    it (`Inalid signature payload schema: ${JSON.stringify(payload)}`, ()=> {
      assert(!signaturePayloadValidate(payload))
    })
  }

  it('Give', async ()=> {
    const target = { something: 'cool', what: 1234 }

    const payload = {
      source: 'my-source',
      targetHash: await sha256Hex(JSON.stringify(target)),
      isDelete: false,
      clock: 0
    }

    const signature = await actorClient.sign(payload, actor)

    let giving = false
    const onGive = args=> {
      giving = true
      expect(args.source).toEqual(payload.source)
      expect(args.targetHash).toEqual(payload.targetHash)
      expect(args.isDelete).toEqual(payload.isDelete)
      expect(args.clock).toEqual(payload.clock)
      expect(args.target).toEqual(target)
      expect(args.actor).toEqual(actor)
      expect(args.signature).toEqual(signature)
    }

    await routeMessage({
      intent: 'give',
      signature,
      target
    }, null, null, onGive, actorClient)

    assert(giving)
  })

  it('Give invalid signature', async ()=> {
    await expect(routeMessage({
      intent: 'give',
      signature: 'blahblahblah',
      target: 'something'
    }, null, null, ()=>{}, actorClient)).rejects.toThrowError()
  })

  it('Give invalid payload', async ()=> {
    const target = 'something'

    const payload = {}

    const signature = await actorClient.sign(payload, actor)

    await expect(routeMessage({
      intent: 'give',
      signature,
      target
    }, null, null, ()=>{}, actorClient)).rejects.toThrowError()
  })

  it('Give invalid hash', async ()=> {
    const target = 'something'

    const payload = {
      source: 'my-source',
      targetHash: '1234',
      isDelete: false,
      clock: 0
    }

    const signature = await actorClient.sign(payload, actor)

    await expect(routeMessage({
      intent: 'give',
      signature,
      target
    }, null, null, ()=>{}, actorClient)).rejects.toThrowError()
  })

  it('Give delete', async ()=> {
    const payload = {
      source: 'my-source',
      targetHash: '1234',
      isDelete: true,
      clock: 0
    }

    const signature = await actorClient.sign(payload, actor)

    let giving = false
    const onGive = args=> {
      giving = true
      expect(args.target).toBeUndefined()
    }

    await routeMessage({
      intent: 'give',
      signature
    }, null, null, onGive, actorClient)

    assert(giving)
  })

  it('Give not delete no target', async ()=> {
    const payload = {
      source: 'my-source',
      targetHash: '1234',
      isDelete: false,
      clock: 0
    }

    const signature = await actorClient.sign(payload, actor)

    await expect(routeMessage({
      intent: 'give',
      signature,
    }, null, null, ()=>{}, actorClient)).rejects.toThrowError()
  })
})
