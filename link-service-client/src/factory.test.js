import LinkFactory from './factory'
import { describe, expect, it, assert } from 'vitest'
import { randomBytes } from '@noble/hashes/utils'
import { mockNonceToPrivateKey, randomString, soon } from './test-utils'

const serviceURL = 'https://link.graffiti.garden'
// const serviceURL = 'http://localhost:8000'

describe(`Link Factory`, ()=> {

  it('get nonexistant', async()=> {
    const lf = new LinkFactory(serviceURL, mockNonceToPrivateKey())
    await expect(lf.get(randomBytes(32))).rejects.toEqual('link not found')
  })

  it('basic put', async()=> {
    const lf = new LinkFactory(serviceURL, mockNonceToPrivateKey())
    const source = randomString()
    const target = randomString()
    const expiration = soon()

    const { created, existing } = await lf.create(source, target, expiration)
    expect(existing).toBeNull()
    expect(created.source).toEqual(source)
    expect(created.target).toEqual(target)
    expect(created.expiration).toEqual(BigInt(expiration))
    expect(created.counter).toEqual(BigInt(0))

    // Fetch it
    const gotten = await lf.get(created.publicKey, source)
    expect(gotten.source).toEqual(source)
    expect(gotten.target).toEqual(target)
  })

  it('replace target', async()=> {
    const lf = new LinkFactory(serviceURL, mockNonceToPrivateKey())
    const source = randomString()
    const target = randomString()
    const expiration = soon()

    // Create and make sure it workd
    const { created } = await lf.create(source, target, expiration)

    // Replace
    const newTarget = randomString()
    const { created: replaced, existing } =
      await created.modify({target: newTarget})
    expect(replaced.target).toEqual(newTarget)
    expect(existing.target).toEqual(target)

    // Fetch it
    const gotten = await lf.get(created.publicKey, source)
    expect(gotten.target).toEqual(newTarget)
  })

  it('put expired data', async()=> {
    const lf = new LinkFactory(serviceURL, mockNonceToPrivateKey())
    const expiration = Math.floor(Math.random() * Date.now()/1000)
    await expect(lf.create(randomString(), randomString(), expiration))
      .rejects.toEqual('data has already expired')
  })

  it('replace expiration forwards', async()=> {
    const lf = new LinkFactory(serviceURL, mockNonceToPrivateKey())
    const expiration = BigInt(soon())

    // Create and make sure it workd
    const source = randomString()
    const { created } = await lf.create(source, randomString(), expiration)

    // Replace
    const newExpiration = expiration + 1n
    const { created: replaced, existing } =
      await created.modify({expiration: newExpiration})
    expect(replaced.expiration).toEqual(newExpiration)
    expect(existing.expiration).toEqual(expiration)

    // Fetch it
    const gotten = await lf.get(created.publicKey, source)
    expect(gotten.expiration).toEqual(BigInt(newExpiration))
  })

  it('replace expiration backwards', async()=> {
    const lf = new LinkFactory(serviceURL, mockNonceToPrivateKey())
    const expiration = soon()

    // Create and make sure it workd
    const source = randomString()
    const target = randomString()
    const { created } = await lf.create(source, target, BigInt(expiration))

    // Replace
    const newExpiration = expiration - Math.floor(Math.random()* 100)
    // Modify protects
    await expect(created.modify({expiration: newExpiration}))
      .rejects.toEqual("expiration cannot decrease")

    // Manually try to force it
    await expect(lf.create(source, target, newExpiration, 1, created.editorNonce))
      .rejects.toEqual("expiration cannot decrease")

    // Fetch it
    const gotten = await lf.get(created.publicKey, source)
    // Expiration does not update backwards!!
    expect(gotten.expiration).toEqual(BigInt(expiration))
  })

  it('replace source', async()=> {
    const lf = new LinkFactory(serviceURL, mockNonceToPrivateKey())
    const source = randomString()
    const target = randomString()

    // Create and make sure it workd
    const { created } = await lf.create(source, target, soon())

    // Replace
    const newSource = randomString()
    const { created: replaced, existing } =
      await created.modify({source: newSource})
    expect(replaced.source).toEqual(newSource)
    expect(existing).toBeNull()

    // Fetch it
    const gotten1 = await lf.get(created.publicKey, newSource)
    expect(gotten1.source).toEqual(newSource)
    expect(gotten1.target).toEqual(target)
    await expect(lf.get(created.publicKey, source))
      .rejects.toEqual('info hash and source mismatch')
  })

  it('shared ownership', async()=> {
    const sharedSecret = randomString()
    const lf1 = new LinkFactory(serviceURL, mockNonceToPrivateKey(sharedSecret))
    const lf2 = new LinkFactory(serviceURL, mockNonceToPrivateKey(sharedSecret))

    const source = randomString()
    const { created } = await lf1.create(source, randomString(), soon())
    assert(await created.isMine())

    const gotten = await lf2.get(created.publicKey, source)
    assert(await gotten.isMine())

    const newTarget = randomString()
    await gotten.modify({target: newTarget})
    const gotten2 = await lf1.get(created.publicKey, source)
    expect(gotten2.target).toEqual(newTarget)
  })

  it('different ownership', async()=> {
    const lf1 = new LinkFactory(serviceURL, mockNonceToPrivateKey())
    const lf2 = new LinkFactory(serviceURL, mockNonceToPrivateKey())

    const source = randomString()
    const { created } = await lf1.create(source, randomString(), soon())
    assert(await created.isMine())

    const gotten = await lf2.get(created.publicKey, source)
    assert(!await gotten.isMine())
    const newTarget = randomString()
    await expect(gotten.modify({target: newTarget}))
      .rejects.toEqual('you cannot modify a link that is not yours')

    // Manually try it
    const { created: replaced, existing } = await lf2.create(source, newTarget, soon(), 1, created.editorNonce)
    expect(existing).toBeNull()
    // It ends up with a different public key
    assert(!replaced.publicKey.every((val, i)=> val==created.publicKey[i]))
  })

  it('counter backwards', async()=> {
    // Generate a big and small counter
    const counterBytes = randomBytes(16)
    const counter1 = new DataView(counterBytes.buffer).getBigInt64(0)
    const counter2 = new DataView(counterBytes.buffer).getBigInt64(8)
    const minCounter = counter1 < counter2 ? counter1 : counter2
    const maxCounter = counter1 > counter2 ? counter1 : counter2
    assert(minCounter < maxCounter)

    const lf = new LinkFactory(serviceURL, mockNonceToPrivateKey())
    const source = randomString()
    const target = randomString()
    const expiration = soon()
    const { created } = await lf.create(
      source, target, expiration, maxCounter)

    // // Manually move counter backwards
    expect(lf.create(
      source, target, expiration, minCounter, created.editorNonce)
    ).rejects.toEqual("counter must increase")
  })

  it('big target', async()=> {
    const lf = new LinkFactory(serviceURL, mockNonceToPrivateKey())
    const target = 'x'.repeat(256 - 16 - 24 - 24)
    await lf.create(randomString(), target, soon())
  })

  it('too big target', async()=> {
    const lf = new LinkFactory(serviceURL, mockNonceToPrivateKey())
    const target = 'x'.repeat(256 - 16 - 24 - 24 + 1)
    await expect(lf.create(randomString(), target, soon()))
      .rejects.toEqual('target is too big')
  })

  it('unicode', async()=> {
    const lf = new LinkFactory(serviceURL, mockNonceToPrivateKey())
    const source = '👻👩🏿‍❤️‍👩🏼👩‍👩‍👧‍👦👯‍♂️👍🏾🤜🏿𝔤𝔯𝔞𝔣𝔣𝔦𝔱𝔦🤛🏿'
    const target = '👀👨🏽‍❤️‍💋‍👨🏿👨‍👨‍👧‍👧🖖🏻🫸🏼Ｇｒａｆｆｉｔｉ🫷🏼'
    const { created } = await lf.create(source, target, soon())
    expect(created.source).toEqual(source)
    expect(created.target).toEqual(target)

    const gotten = await lf.get(created.publicKey, source)
    expect(gotten.source).toEqual(source)
    expect(gotten.target).toEqual(target)
  })

  it('expire', async ()=> {
    const expirationTime = 3 // seconds
    const lf = new LinkFactory(serviceURL, mockNonceToPrivateKey())
    const source = randomString()
    const target = randomString()
    const expiration = Math.ceil(Date.now()/1000) + expirationTime

    // Create and fetch
    const { created } = await lf.create(source, target, expiration)
    const gotten = await lf.get(created.publicKey, source)
    expect(gotten.source).toEqual(source)
    expect(gotten.target).toEqual(target)

    // Wait the expiration time
    await new Promise(r => setTimeout(r, (expirationTime + 1)*1000))
    await expect(lf.get(created.publicKey, source))
      .rejects.toEqual('link not found')
  })
})