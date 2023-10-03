import { describe, it, assert, expect } from 'vitest'
import { actorClientMock } from './mock'
import routeMessage, { addSignaturePayloadValidate, messageSchemaValidate } from "../src/link-from-messaging"
import { randomHash, sha256Hex } from '../src/util'

describe('Link messaging', async ()=> {

  const { actor, actorClient } = actorClientMock()

  for (const message of [
    { intent: 'have', links: { 'ksdjfkdjf': true } },
    { intent: 'want', links: { 'jfhjdhHFDJH-_34': true, 'REIUIdjfh394': false } },
    { intent: 'give', addSignature: '9493989', target: null },
    { intent: 'give', deleteSignature: 'asdkfjdk' },
    { intent: 'give', addSignature: 'kasjdfkjdkfjd', target: 1 },
    { intent: 'give', addSignature: 'kasjdfkjdkfjd', target: 'kdjfkj' },
    { intent: 'give', addSignature: 'ka434ufdhf', target: { something: 'sdkfj'} }
  ]) {
    it (`Valid message: ${JSON.stringify(message)}`, ()=> {
      assert(messageSchemaValidate(message))
    })
  }

  for (const message of [
    {},
    { links: { 'ksdjfkdjf': true } },
    { intent: 'adksjfk', links: { 'ksdjfkdjf': true } },
    { intent: 'have' },
    { intent: 'want' },
    { intent: 'give' },
    { intent: 'have', links: {}},
    { intent: 'have', links: { '!!!': false } },
    { intent: 'have', links: { 'aksdjfkdj': 1 } },
    { intent: 'have', links: { ['a'.repeat(400)]: 1 } },
    { intent: 'have', links: { 'asdkjfkdj': true }, something: 'else' },
    { intent: 'have', links: { 'asdkjfkdj': true }, target: ''},
    { intent: 'give', links: { 'askdfjkdj': true } },
    { intent: 'give', target: '' },
    { intent: 'give', addSignature: 1, target: '' },
    { intent: 'give', deleteSignature: 'aksdjfkdj', addSignature: 'aksdjfkd', target: '' },
    { intent: 'give', deleteSignature: 'aksdjfkdj', target: 1 }
  ]) {
    it (`Invalid message: ${JSON.stringify(message)}`, ()=> {
      assert(!messageSchemaValidate(message))
    })
  }

  it('have and want', async ()=> {
    const links = {
      'kdjfkdjf': true
    } 
    let have = 0
    let want = 0
    const onHave = (cs)=>{
      expect(cs).toEqual(links)
      have++
    }
    const onWant = (cs)=>{
      expect(cs).toEqual(links)
      want++
    }

    console.log("here")
    await routeMessage({ intent: 'have', links }, onHave, onWant)
    expect(have).toEqual(1)
    expect(want).toEqual(0)

    await routeMessage({ intent: 'want', links }, onHave, onWant)
    expect(have).toEqual(1)
    expect(want).toEqual(1)
  })

  for (const payload of [
    { source: 'asdfjkdfj', targetHash: 'kdjfkdjf', salt: 'ksdjkdjjf' }
  ]) {
    it (`Valid signature payload schema: ${JSON.stringify(payload)}`, ()=> {
      assert(addSignaturePayloadValidate(payload))
    })
  }

  for (const payload of [
    {},
    { source2: 'asdfjkdfj', targetHash: 'kdjfkdjf', salt: 'kasdjfk'},
    { targetHash: 'kdjfkdjf', salt: 'kasdjfk'},
    { source: 'asdfjkdfj', targetHash: 'kdjfkdjf', salt: 10 },
    { source: 'asdfjkdfj', targetHash: 'kdjfkdjf', salt: 'ksdjkdjjf', something: 'else' },
  ]) {
    it (`Inalid signature payload schema: ${JSON.stringify(payload)}`, ()=> {
      assert(!addSignaturePayloadValidate(payload))
    })
  }

  it('Give', async ()=> {
    const target = { something: 'cool', what: 1234 }

    const payload = {
      source: 'my-source',
      targetHash: await sha256Hex(JSON.stringify(target)),
      salt: crypto.randomUUID()
    }

    const addSignature = await actorClient.sign(payload, actor)

    const message = {
      intent: 'give',
      addSignature,
      target
    }

    let giving = false
    const onGive = args=> {
      giving = true
      expect(args.source).toEqual(payload.source)
      expect(args.targetHash).toEqual(payload.targetHash)
      expect(args.deleting).toEqual(false)
      expect(args.salt).toEqual(payload.salt)
      expect(args.target).toEqual(target)
      expect(args.actor).toEqual(actor)
      expect(args.message).toEqual(message)
      expect(Object.keys(args).length).toEqual(7)
    }

    await routeMessage(message, null, null, onGive, actorClient)

    assert(giving)
  })

  it('Give invalid signature', async ()=> {
    await expect(routeMessage({
      intent: 'give',
      addSignature: 'blahblahblah',
      target: 'something'
    }, null, null, ()=>{}, actorClient)).rejects.toThrowError()
  })

  it('Give invalid payload', async ()=> {
    const target = 'something'

    const payload = {}

    const addSignature = await actorClient.sign(payload, actor)

    await expect(routeMessage({
      intent: 'give',
      addSignature,
      target
    }, null, null, ()=>{}, actorClient)).rejects.toThrowError()
  })

  it('Give invalid hash', async ()=> {
    const target = 'something'

    const payload = {
      source: 'my-source',
      targetHash: '1234',
      salt: crypto.randomUUID()
    }

    const addSignature = await actorClient.sign(payload, actor)

    await expect(routeMessage({
      intent: 'give',
      addSignature,
      target
    }, null, null, ()=>{}, actorClient)).rejects.toThrowError()
  })

  it('Give delete', async ()=> {
    const payload = {
      source: 'my-source',
      targetHash: '1234',
      salt: crypto.randomUUID()
    }

    const addSignature = await actorClient.sign(payload, actor)
    const deleteSignature = await actorClient.sign(addSignature, actor)

    let giving = false
    const onGive = args=> {
      giving = true
      expect(args.target).toBeUndefined()
      expect(args.deleting).toEqual(true)
    }

    await routeMessage({
      intent: 'give',
      deleteSignature
    }, null, null, onGive, actorClient)

    assert(giving)
  })

  it('Give with invalid signature', async ()=> {
    await expect(routeMessage({
      intent: 'give',
      deleteSignature: 'asdkfjdkfj'
    }, null, null, ()=>{}, actorClient)).rejects.toThrowError()
  })

  it('Delete with wrong actor', async ()=> {
    const payload = {
      source: 'my-source',
      targetHash: '1234',
      salt: crypto.randomUUID()
    }

    const addSignature = await actorClient.sign(payload, actor)
    const { actor: actor2, actorClient: actorClient2 } = actorClientMock()
    const deleteSignature = await actorClient2.sign(addSignature, actor2)

    await expect(routeMessage({
      intent: 'give',
      deleteSignature
    }, null, null, ()=>{}, actorClient)).rejects.toThrowError()
  })
})
