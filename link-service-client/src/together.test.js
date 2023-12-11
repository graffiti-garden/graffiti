import { describe, expect, it, assert } from 'vitest'
import LinkStreamer from './streamer'
import LinkFactory from './factory'
import { randomString, soon, mockNonceToPrivateKey } from './test-utils'

const factoryURL = 'https://link.graffiti.garden'
const streamerURL = 'wss://link.graffiti.garden'

describe(`Basic Streaming`, ()=> {
  it('announce existing', async()=> {
    const lf = new LinkFactory(factoryURL, mockNonceToPrivateKey())
    const sourceURI = randomString()
    const targetURI = randomString()
    const expiration = soon()
    const { created } = await lf.create(sourceURI, targetURI, expiration)

    const ls = new LinkStreamer(streamerURL)
    const iterator = ls.subscribe(sourceURI)

    const announce = (await iterator.next()).value
    expect(announce.type).toEqual('announce')
    assert(announce.publicKey.every((val, i)=> val==created.publicKey[i]))

    const parsed = lf.parse(announce.publicKey, announce.containerSigned, sourceURI)
    expect(parsed.targetURI).toEqual(targetURI)

    await expect(iterator.next()).resolves.toHaveProperty('value.type', 'backlog-complete')
  })

  it('announce future', async()=> {
    const sourceURI = randomString()
    const ls = new LinkStreamer(streamerURL)
    const iterator = ls.subscribe(sourceURI)
    await expect(iterator.next()).resolves.toHaveProperty('value.type', 'backlog-complete')

    const lf = new LinkFactory(factoryURL, mockNonceToPrivateKey())
    const targetURI = randomString()
    const expiration = soon()
    await lf.create(sourceURI, targetURI, expiration)

    const announce = (await iterator.next()).value
    expect(announce.type).toEqual('announce')
    const parsed = lf.parse(announce.publicKey, announce.containerSigned, sourceURI)
    expect(parsed.targetURI).toEqual(targetURI)
  })
})