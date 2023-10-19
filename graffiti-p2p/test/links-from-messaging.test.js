import { describe, it, assert, expect } from 'vitest'
import { actorClientMock } from './mock'
import routeMessage, { signaturePayloadValidate, messageSchemaValidate } from "../src/links-from-messaging"
import { sha256Hex } from '../src/util'

describe('Link messaging', async ()=> {

  const { actor, actorClient } = actorClientMock()

  for (const message of [
    { intent: 'have', links: { 'ksdjfkdjf': true } },
    { intent: 'want', links: { 'jfhjdhHFDJH-_34': true, 'REIUIdjfh394': false } },
    { intent: 'give', signature: 'asdkfjdk' },
    { intent: 'give', signature: '9493989', target: null },
    { intent: 'give', signature: 'kasjdfkjdkfjd', target: 1 },
    { intent: 'give', signature: 'kasjdfkjdkfjd', target: 'kdjfkj' },
    { intent: 'give', signature: 'ka434ufdhf', target: { something: 'sdkfj'} }
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
    { intent: 'have', links: { 'aksdjfkdj': 1 } },
    { intent: 'have', links: { ['a'.repeat(400)]: 1 } },
    { intent: 'have', links: { 'asdkjfkdj': true }, something: 'else' },
    { intent: 'have', links: { 'asdkjfkdj': true }, target: ''},
    { intent: 'give', links: { 'askdfjkdj': true } },
    { intent: 'give', target: '' },
    { intent: 'give', signature: 1, target: '' },
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

    await routeMessage({ intent: 'have', links }, onHave, onWant)
    expect(have).toEqual(1)
    expect(want).toEqual(0)

    await routeMessage({ intent: 'want', links }, onHave, onWant)
    expect(have).toEqual(1)
    expect(want).toEqual(1)
  })

  for (const payload of [
    { source: 'asdfjkdfj', targetHash: 'kdjfkdjf', salt: 'ksdjkdjjf', deleted: false },
    { source: 'asdfj39483kdfj', targetHash: 'kdjfk34djf', salt: 'ksdjkdj9234jf', deleted: true },
    { source: 1234, targetHash: 'kdjfk34djf', salt: 'ksdjkdj9234jf', deleted: true },
    { source: {}, targetHash: 'kdjfk34djf', salt: 'ksdjkdj9234jf', deleted: true },
    { source: { something: 'cool', like: 'this'}, targetHash: 'kdjfk34djf', salt: 'ksdjkdj9234jf', deleted: true }
  ]) {
    it (`Valid signature payload schema: ${JSON.stringify(payload)}`, ()=> {
      assert(signaturePayloadValidate(payload))
    })
  }

  for (const payload of [
    {},
    { source2: 'asdfjkdfj', targetHash: 'kdjfkdjf', salt: 'kasdjfk', deleted: false},
    { source2: 'asdfjkdfj', targetHash: 'kdjfkdjf', salt: 'kasdjfk', deleted: true},
    { targetHash: 'kdjfkdjf', salt: 'kasdjfk', deleted: true},
    { source: 'asdfjkdfj', targetHash: 'kdjfkdjf', salt: 10, deleted: false },
    { source: 'asdfjkdfj', targetHash: 'kdjfkdjf', salt: 'aksdjfk', deleted: null },
    { source: 'asdfjkdfj', targetHash: 'kdjfkdjf', salt: 'ksdjkdjjf', something: 'else', deleted: true },
  ]) {
    it (`Inalid signature payload schema: ${JSON.stringify(payload)}`, ()=> {
      assert(!signaturePayloadValidate(payload))
    })
  }

  it('Give add', async ()=> {
    const target = { something: 'cool', what: 1234 }

    const payload = {
      source: 'my-source',
      targetHash: await sha256Hex(JSON.stringify(target)),
      salt: crypto.randomUUID(),
      deleted: false
    }

    const signature = await actorClient.sign(payload, actor)

    const message = {
      intent: 'give',
      signature,
      target
    }

    let giving = false
    const onGive = args=> {
      giving = true
      expect(args.source).toEqual(payload.source)
      expect(args.targetHash).toEqual(payload.targetHash)
      expect(args.deleted).toEqual(false)
      expect(args.salt).toEqual(payload.salt)
      expect(args.target).toEqual(target)
      expect(args.actor).toEqual(actor)
      expect(args.signature).toEqual(signature)
      expect(Object.keys(args).length).toEqual(7)
    }

    await routeMessage(message, null, null, onGive, actorClient)

    assert(giving)
  })

  it('Give invalid signature', async ()=> {
    await expect(routeMessage({
      intent: 'give',
      signature: 'blahblahblah',
      target: 'something',
      deleted: false
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
      salt: crypto.randomUUID(),
      deleted: false
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
      salt: crypto.randomUUID(),
      deleted: true
    }

    const signature = await actorClient.sign(payload, actor)

    let giving = false
    const onGive = args=> {
      giving = true
      expect(args.target).toBeUndefined()
      expect(args.deleted).toEqual(true)
    }

    await routeMessage({
      intent: 'give',
      signature
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
