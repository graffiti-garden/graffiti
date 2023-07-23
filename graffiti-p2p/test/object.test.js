import { describe, expect, it } from 'vitest'
import * as jose from 'jose'
import P2PWrapper from "../src/p2p-wrapper"
import GraffitiObject from "../src/object"
import options from './options'

describe('Object', ()=> {

  it('basic object properties', async ()=> {
    const pw1 = new P2PWrapper(await options())

    const path = "something"
    const object1 = pw1.get(GraffitiObject, pw1.options.actor.id, path)
    expect(object1.value.actor).to.equal(pw1.options.actor.id)
    expect(object1.value.path).to.equal(path)
    expect(object1.value.id).to.equal(`object:${pw1.options.actor.id}:${path}`)
  })

  it('setting and receiving an object', async ()=> {
    const pw1 = new P2PWrapper(await options())

    const path = "something"
    const object1 = pw1.get(GraffitiObject, pw1.options.actor.id, path)
    const object1Value = object1.value
    await object1.set({hello: 'world'})
    expect(object1Value.hello).to.equal('world')

    const pw2 = new P2PWrapper(await options())
    const object2 = pw2.get(GraffitiObject, pw1.options.actor.id, path)
    const object2Value = object2.value
    await new Promise(r=> setTimeout(r, 500));
    expect(object2Value.hello).to.equal('world')
  })

  it('setting an object, not yours', async ()=> {
    const pw = new P2PWrapper(await options())
    const object = pw.get(GraffitiObject, '1234', '1234')
    expect(object.set({hello: 'world'})).rejects.toThrowError()
  })

  it('setting and deleting an object implicitly', async ()=> {
    const pw1 = new P2PWrapper(await options())
    const path = "something"
    const object1 = pw1.get(GraffitiObject, pw1.options.actor.id, path)
    const object1Value = object1.value
    object1Value.something = 'else'

    const pw2 = new P2PWrapper(await options())
    const object2 = pw2.get(GraffitiObject, pw1.options.actor.id, path)
    const object2Value = object2.value
    await new Promise(r=> setTimeout(r, 500));
    expect(object2Value.something).to.equal('else')

    delete object1Value.something
    await new Promise(r=> setTimeout(r, 500));
    expect(object2Value.something).toBeUndefined()
  })

  it('error on implicit set or delete', async ()=> {
    const pw1 = new P2PWrapper(await options())
    const path = "something"
    const object1 = await pw1.get(GraffitiObject, 'slkdfjkdf', path)
    const object1Value = object1.value
    expect(()=> object1Value.something = 'else').toThrowError()
    expect(object1Value.something).toBeUndefined()
    expect(()=> delete object1Value.something).toThrowError()
  })

  it('setting from same user', async ()=> {
    const opts = await options()
    const path = "something"
    const actor = opts.actor.id

    const pw1 = new P2PWrapper(opts)
    const object1 = pw1.get(GraffitiObject, actor, path)
    const object1Value = object1.value

    const pw2 = new P2PWrapper(opts)
    const object2 = pw2.get(GraffitiObject, actor, path)
    const object2Value = object2.value

    object1Value.feelings = 'like'
    await new Promise(r=> setTimeout(r, 500));
    expect(object2Value.feelings).to.equal('like')

    object2Value.feelings += ' a lot'
    await new Promise(r=> setTimeout(r, 500));
    expect(object1Value.feelings).to.equal('like a lot')
  })

  it('setting an object not an object', async()=> {
    const pw = new P2PWrapper(await options())
    const object = pw.get(GraffitiObject, pw.options.actor.id, '1234')
    expect(object.set("1234")).rejects.toThrowError()
  })

  // TODO:
  // sending bad messages
  // it('invalid JWT')
  // it('invalid date')
})