import { describe, expect, it } from 'vitest'
import P2PWrapper from "../src/p2p-wrapper"
import GraffitiObject from "../src/object"
import { options, actorClientMock } from './mock'

const timeout = 20000

describe('Object', async ()=> {

  const { actor: actor1, actorClient: actorClient1 } = actorClientMock()
  const { actor: actor2, actorClient: actorClient2 } = actorClientMock()
  const pw1 = new P2PWrapper(actorClient1, options)
  const pw2 = new P2PWrapper(actorClient2, options)

  it('basic object properties', async ()=> {
    const path = "something"
    const object1 = pw1.get(GraffitiObject, actor1, path)
    expect(object1.value.actor).to.equal(actor1)
    expect(object1.value.path).to.equal(path)
    expect(object1.value.id).to.equal(`object:${actor1}:${path}`)
  }, timeout)

  it('setting and receiving an object', async ()=> {
    const path = "something"
    const object1 = pw1.get(GraffitiObject, actor1, path)
    const object1Value = object1.value
    await object1.set({hello: 'world'})
    expect(object1Value.hello).to.equal('world')

    const object2 = pw2.get(GraffitiObject, actor1, path)
    const object2Value = object2.value
    await new Promise(r=> setTimeout(r, 2000));
    expect(object2Value.hello).to.equal('world')
  }, timeout)

  it('setting an object, not yours', async ()=> {
    const object = pw1.get(GraffitiObject, actor2, '1234')
    expect(object.set({hello: 'world'})).rejects.toThrowError()
  }, timeout)

  it('setting and deleting an object implicitly', async ()=> {
    const path = "something"
    const object1 = pw1.get(GraffitiObject, actor1, path)
    const object1Value = object1.value
    object1Value.something = 'else'

    const object2 = pw2.get(GraffitiObject, actor1, path)
    const object2Value = object2.value
    await new Promise(r=> setTimeout(r, 2000));
    expect(object2Value.something).to.equal('else')

    delete object1Value.something
    await new Promise(r=> setTimeout(r, 2000));
    expect(object2Value.something).toBeUndefined()
  }, timeout)

  it('error on implicit set or delete', async ()=> {
    const path = "something"
    const objectFrom1 = await pw1.get(GraffitiObject, actor1, path)
    objectFrom1.value.something = "special"

    const objectFrom2 = await pw2.get(GraffitiObject, actor1, path)
    await new Promise(r=> setTimeout(r, 2000));
    expect(objectFrom2.value.something).to.equal('special')

    // Object will reset once rejected
    objectFrom2.value.something = "else"
    await new Promise(r=> setTimeout(r, 500));
    expect(objectFrom2.value.something).to.equal('special')

    delete objectFrom2.value.something
    await new Promise(r=> setTimeout(r, 500));
    expect(objectFrom2.value.something).to.equal('special')
  }, timeout)

  it('setting from same user', async ()=> {
    const path = "something"

    const object1 = pw1.get(GraffitiObject, actor1, path)
    const object1Value = object1.value

    const pw12 = new P2PWrapper(actorClient1, options)
    const object2 = pw12.get(GraffitiObject, actor1, path)
    const object2Value = object2.value

    object1Value.feelings = 'like'
    await new Promise(r=> setTimeout(r, 2000));
    expect(object2Value.feelings).to.equal('like')

    object2Value.feelings += ' a lot'
    await new Promise(r=> setTimeout(r, 2000));
    expect(object1Value.feelings).to.equal('like a lot')
  }, timeout)

  it('setting an object not an object', async()=> {
    const object = pw1.get(GraffitiObject, actor1, '1234')
    expect(object.set("1234")).rejects.toThrowError()
  }, timeout)

  // TODO:
  // sending bad messages
  // it('invalid JWT')
  // it('invalid date')
})