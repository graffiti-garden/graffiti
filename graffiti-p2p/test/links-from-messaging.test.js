import { describe, it, assert, expect } from 'vitest'
import { actorClientMock } from './mock'
import routeMessage, { signaturePayloadValidate, messageSchemaValidate } from "../src/links-from-messaging"
import { sha256Hex, randomHash } from '../src/util'
import * as stringify from 'fast-json-stable-stringify'

describe('Link messaging', async ()=> {

  const { actor, actorClient } = actorClientMock()

  for (const message of [
    { intent: 'have', links: { 'ksdjfkdjf': true } },
    { intent: 'want', links: { 'jfhjdhHFDJH-_34': true, 'REIUIdjfh394': false } },
    { intent: 'give', signature: 'asdkfjdk', source: "hi" },
    { intent: 'give', signature: '9493989', target: null, source: false },
    { intent: 'give', signature: 'kasjdfkjdkfjd', target: 1, source: {} },
    { intent: 'give', signature: 'kasjdfkjdkfjd', target: 'kdjfkj', source: 1234 },
    { intent: 'give', signature: 'ka434ufdhf', target: { something: 'sdkfj' }, source: null }
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
    { intent: 'give', signature: "asdf" },
    { intent: 'give', source: "asdkf" },
    { intent: 'give', target: '', source: "asdkf" },
    { intent: 'give', signature: 1, target: '', source: "asdfk" },
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
    { sourceHash: await randomHash(), targetHash: await randomHash(), salt: 'ksdjkdjjf', deleted: false },
    { sourceHash: await randomHash(), targetHash: await randomHash(), salt: 'ksdjkdjjf', deleted: true },
    { sourceHash: await randomHash(), targetHash: await randomHash(), salt: '', deleted: true },
    { sourceHash: await randomHash(), targetHash: await randomHash(), salt: crypto.randomUUID(), deleted: false },
  ]) {
    it (`Valid signature payload schema: ${JSON.stringify(payload)}`, ()=> {
      assert(signaturePayloadValidate(payload))
    })
  }

  for (const payload of [
    {},
    { sourceHash: await randomHash(), targetHash: await randomHash(), salt: 'ksdjkdjjf', deleted: null },
    { sourceHash: await randomHash(), targetHash: await randomHash(), deleted: false },
    { targetHash: await randomHash(), salt: 'ksdjkdjjf', deleted: false },
    { sourceHash: await randomHash(), salt: 'ksdjkdjjf', deleted: false },
    { sourceHash: await randomHash(), targetHash: await randomHash(), salt: 'ksdjkdjjf' },
    { sourceHash: await randomHash(), targetHash: await randomHash(), salt: 'ksdjkdjjf', deleted: false, something: 'else' },
    { sourceHash: 'hi', targetHash: await randomHash(), salt: 'ksdjkdjjf', deleted: false },
    { sourceHash: await randomHash(), targetHash: 'ho', salt: 'ksdjkdjjf', deleted: false },
    { sourceHash: await randomHash(), targetHash: await randomHash(), salt: crypto.randomUUID()+'a', deleted: false },
  ]) {
    it (`Inalid signature payload schema: ${JSON.stringify(payload)}`, ()=> {
      assert(!signaturePayloadValidate(payload))
    })
  }

  it('Give add', async ()=> {
    const source = 'my-source'
    const target = { something: 'cool', what: 1234 }

    const payload = {
      sourceHash: await sha256Hex(stringify(source)),
      targetHash: await sha256Hex(stringify(target)),
      salt: crypto.randomUUID(),
      deleted: false
    }

    const signature = await actorClient.sign(payload, actor)

    const message = {
      intent: 'give',
      signature,
      source,
      target
    }

    let giving = false
    const onGive = args=> {
      giving = true
      expect(args.source).toEqual(source)
      expect(args.target).toEqual(target)
      expect(args.sourceHash).toEqual(payload.sourceHash)
      expect(args.targetHash).toEqual(payload.targetHash)
      expect(args.deleted).toEqual(false)
      expect(args.salt).toEqual(payload.salt)
      expect(args.actor).toEqual(actor)
      expect(args.signature).toEqual(signature)
      expect(Object.keys(args).length).toEqual(8)
    }

    await routeMessage(message, null, null, onGive, actorClient)

    assert(giving)
  })

  it('Give invalid signature', async ()=> {
    await expect(routeMessage({
      intent: 'give',
      signature: 'blahblahblah',
      source: "asdf",
      target: 'something'
    }, null, null, ()=>{}, actorClient)).rejects.toThrowError()
  })

  it('Give invalid payload', async ()=> {
    await expect(routeMessage({
      intent: 'give',
      signature: await actorClient.sign({}, actor),
      target: "asdf",
      source: "asdf"
    }, null, null, ()=>{}, actorClient)).rejects.toThrowError()
  })

  it('Give invalid target hash', async ()=> {
    const source = 'asdf'
    const target = 'something'

    const payload = {
      sourceHash: await sha256Hex(stringify(source)),
      targetHash: '1234',
      salt: crypto.randomUUID(),
      deleted: false
    }

    const signature = await actorClient.sign(payload, actor)

    const message = {
      intent: 'give',
      signature,
      source,
      target
    }

    await expect(routeMessage(message, null, null, ()=>{}, actorClient)).rejects.toThrowError()
  })

  it('Give invalid source hash', async ()=> {
    const source = 'asdf'
    const target = 'something'

    const payload = {
      sourceHash: 'adsf',
      // sourceHash: await sha256Hex(stringify(source)),
      targetHash: await sha256Hex(stringify(target)),
      salt: crypto.randomUUID(),
      deleted: false
    }

    const signature = await actorClient.sign(payload, actor)

    const message = {
      intent: 'give',
      signature,
      source,
      target
    }

    await expect(routeMessage(message, null, null, ()=>{}, actorClient)).rejects.toThrowError()
  })

  it('Give delete', async ()=> {
    const source = 'my-source'
    const payload = {
      sourceHash: await sha256Hex(stringify(source)),
      targetHash: await randomHash(),
      salt: crypto.randomUUID(),
      deleted: true
    }

    const signature = await actorClient.sign(payload, actor)

    let giving = false
    const onGive = args=> {
      giving = true
      expect(args.target).toBeUndefined()
      expect(args.sourceHash).toEqual(payload.sourceHash)
      expect(args.source).toEqual(source)
      expect(args.deleted).toEqual(true)
    }

    await routeMessage({
      intent: 'give',
      source,
      signature
    }, null, null, onGive, actorClient)

    assert(giving)
  })

  it('Give with invalid signature', async ()=> {
    await expect(routeMessage({
      intent: 'give',
      source: {},
      signature: 'asdkfjdkfj'
    }, null, null, ()=>{}, actorClient)).rejects.toThrowError()
  })
})
