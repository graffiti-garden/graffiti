import { describe, expect, it, assert } from 'vitest'
import LinkStreamer from './streamer'
import { randomBytes, concatBytes } from '@noble/hashes/utils'
import { randomString } from './test-utils'

const link = 'wss://link.graffiti.garden'

describe(`Basic Streaming`, ()=> {
  it('no info hash', async()=> {
    const ls = new LinkStreamer(link)
    await ls.tilOpen()

    for (const subscribe of [true, false]) {
      await expect(ls.request(subscribe)).rejects.toEqual("no info hash")
    }
  })

  it('incorrect info hash', async()=> {
    const ls = new LinkStreamer(link)
    await ls.tilOpen()

    for (const subscribe of [true, false]) {
      for (const numBytes of [1, 31, 45, 100]) {
        await expect(ls.request(subscribe, randomBytes(numBytes)))
          .rejects.toEqual("info hashes must each be exactly 32 bytes")
      }
    }
  })

  it('good request', async()=> {
    const ls = new LinkStreamer(link)
    await ls.tilOpen()

    for (const numBytes of [32, 64, 128]) {
      const infoHashes = randomBytes(numBytes)
      for (const subscribe of [true, false]) {
        await expect(ls.request(subscribe, infoHashes))
          .resolves.toBeUndefined()
      }
    }
  })

  it('double subscribe via request', async()=> {
    const ls = new LinkStreamer(link)
    await ls.tilOpen()

    const infoHash = randomBytes()
    await expect(ls.request(true, concatBytes(
      randomBytes(32),
      infoHash,
      randomBytes(64)
    ))).resolves.toBeUndefined()

    await expect(ls.request(true, concatBytes(
      randomBytes(128),
      infoHash,
    ))).rejects.toEqual('already subscribed')
  })

  it('invalid unsubscribe', async()=> {
    const ls = new LinkStreamer(link)
    await ls.tilOpen()

    await expect(ls.request(false, concatBytes(
      randomBytes(32),
    ))).rejects.toEqual('not subscribed')
  })

  it('double subscribe', async()=> {
    const ls = new LinkStreamer(link)

    const uri = randomString()

    const firstIterator = ls.subscribe(uri, AbortSignal.timeout(300))
    await firstIterator.next() // backlog complete

    await expect(ls.subscribe(uri, AbortSignal.timeout(100)).next())
      .rejects.toEqual("already subscribed")

    await expect(firstIterator.next()).rejects.toHaveProperty("name", "TimeoutError")
  })

  it('double subscription after timeout', async()=> {
    const ls = new LinkStreamer(link)

    const uri = randomString()

    let iterator
    iterator = ls.subscribe(uri, AbortSignal.timeout(100))
    await iterator.next() // Backlog complete
    await expect(iterator.next()).rejects.toHaveProperty("name", "TimeoutError")

    iterator = ls.subscribe(uri, AbortSignal.timeout(100))
    await iterator.next() // Backlog complete
    await expect(iterator.next()).rejects.toHaveProperty("name", "TimeoutError")
  })

  it('backlog', async()=> {
    const ls = new LinkStreamer(link)

    const iterators = []

    for (let i=0; i < 10; i++) {
      iterators.push(ls.subscribe(randomString()))
    }
    assert(!ls.open)

    for (const iterator of iterators) {
      await expect(iterator.next()).resolves.toHaveProperty('value.type', 'backlog-complete')
    }
  })
})