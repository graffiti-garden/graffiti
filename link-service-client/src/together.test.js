import { describe, expect, it, assert } from 'vitest'
import LinkStreamer from './streamer'
import LinkFactory from './factory'
import { randomString, soon, mockNonceToPrivateKey } from './test-utils'

const factoryURL = 'https://link.graffiti.garden'
const streamerURL = 'wss://link.graffiti.garden'

describe(`Basic Streaming`, ()=> {
  it('announce existing', async()=> {
    const lf = new LinkFactory(factoryURL, mockNonceToPrivateKey())
    const source = randomString()
    const target = randomString()
    const expiration = soon()
    const { created } = await lf.create(source, target, expiration)

    const ls = new LinkStreamer(streamerURL)
    const iterator = ls.subscribe(source)

    const announce = (await iterator.next()).value
    expect(announce.type).toEqual('announce')
    assert(announce.publicKey.every((val, i)=> val==created.publicKey[i]))

    const parsed = lf.parse(announce.publicKey, announce.containerSigned, source)
    expect(parsed.target).toEqual(target)

    await expect(iterator.next()).resolves.toHaveProperty('value.type', 'backlog-complete')
  })

  it('announce future', async()=> {
    const source = randomString()
    const ls = new LinkStreamer(streamerURL)
    const iterator = ls.subscribe(source)
    await expect(iterator.next()).resolves.toHaveProperty('value.type', 'backlog-complete')

    const lf = new LinkFactory(factoryURL, mockNonceToPrivateKey())
    const target = randomString()
    const expiration = soon()
    const { created } = await lf.create(source, target, expiration)

    const announce = (await iterator.next()).value
    expect(announce.type).toEqual('announce')
    const parsed = lf.parse(announce.publicKey, announce.containerSigned, source)
    expect(parsed.target).toEqual(target)
  })

  it('replace target', async()=> {
    const lf = new LinkFactory(factoryURL, mockNonceToPrivateKey())
    const source = randomString()
    const target = randomString()
    const expiration = soon()
    const { created } = await lf.create(source, target, expiration)

    const ls = new LinkStreamer(streamerURL)
    const iterator = ls.subscribe(source)

    // Get announce and backlog
    await expect(iterator.next()).resolves.toHaveProperty('value.type', 'announce')
    await expect(iterator.next()).resolves.toHaveProperty('value.type', 'backlog-complete')

    // Replace
    const newTarget = randomString()
    created.modify({target: newTarget })

    const announce = (await iterator.next()).value
    expect(announce.type).toEqual('announce')
    const parsed = lf.parse(announce.publicKey, announce.containerSigned, source)
    expect(parsed.target).toEqual(newTarget)
  })

  // it('replace source', async()=> {
  //   const lf = new LinkFactory(factoryURL, mockNonceToPrivateKey())
  //   const source = randomString()
  //   const target = randomString()
  //   const expiration = soon()
  //   const { created } = await lf.create(source, target, expiration)

  //   const ls = new LinkStreamer(streamerURL)
  //   const iterator = ls.subscribe(source)

  //   // Get announce and backlog
  //   await expect(iterator.next()).resolves.toHaveProperty('value.type', 'announce')
  //   await expect(iterator.next()).resolves.toHaveProperty('value.type', 'backlog-complete')

  //   // Replace
  //   const newSource = randomString()
  //   created.modify({source: newSource })

  //   console.log("here")
  //   const announce = (await iterator.next()).value
  //   console.log(announce)
    // expect(announce.type).toEqual('announce')
    // const parsed = lf.parse(announce.publicKey, announce.containerSigned, source)
    // expect(parsed.target).toEqual(newTarget)
  // })
})