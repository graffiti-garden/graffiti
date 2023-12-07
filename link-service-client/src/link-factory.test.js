import LinkFactory from './link-factory'
import { describe, expect, it, assert } from 'vitest'
import { sha256 } from '@noble/hashes/sha256'
import { concatBytes, randomBytes, utf8ToBytes, bytesToHex } from '@noble/hashes/utils'

const serviceURL = 'https://link.graffiti.garden'
// const serviceURL = 'http://localhost:8000'
function randomString(length=64) {
  return bytesToHex(randomBytes(length/2))
}
function soon() {
  return Math.ceil(Date.now()/1000) + 100
}
function mockNonceToPrivateKey(secret) {
  secret = secret ?? randomString()
  return nonce=> sha256(concatBytes(nonce, utf8ToBytes(secret)))
}

describe(`Link Factory`, ()=> {

  it('get nonexistant', async()=> {
    const lf = new LinkFactory(serviceURL, mockNonceToPrivateKey())
    await expect(lf.get(randomBytes(32))).rejects.toEqual('link not found')
  })

  it('basic put', async()=> {
    const lf = new LinkFactory(serviceURL, mockNonceToPrivateKey())
    const sourceURI = randomString()
    const targetURI = randomString()
    const expiration = soon()

    const { created, existing } = await lf.create(sourceURI, targetURI, expiration)
    expect(existing).toBeUndefined()
    expect(created.sourceURI).toEqual(sourceURI)
    expect(created.targetURI).toEqual(targetURI)
    expect(created.expiration).toEqual(BigInt(expiration))
    expect(created.counter).toEqual(BigInt(0))

    // Fetch it
    const gotten = await lf.get(created.publicKey, sourceURI)
    expect(gotten.sourceURI).toEqual(sourceURI)
    expect(gotten.targetURI).toEqual(targetURI)
  })

  it('replace target', async()=> {
    const lf = new LinkFactory(serviceURL, mockNonceToPrivateKey())
    const sourceURI = randomString()
    const targetURI = randomString()
    const expiration = soon()

    // Create and make sure it workd
    const { created } = await lf.create(sourceURI, targetURI, expiration)

    // Replace
    const newTargetURI = randomString()
    const { created: replaced, existing } =
      await created.modify({targetURI: newTargetURI})
    expect(replaced.targetURI).toEqual(newTargetURI)
    expect(existing.targetURI).toEqual(targetURI)

    // Fetch it
    const gotten = await lf.get(created.publicKey, sourceURI)
    expect(gotten.targetURI).toEqual(newTargetURI)
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
    const sourceURI = randomString()
    const { created } = await lf.create(sourceURI, randomString(), expiration)

    // Replace
    const newExpiration = expiration + 1n
    const { created: replaced, existing } =
      await created.modify({expiration: newExpiration})
    expect(replaced.expiration).toEqual(newExpiration)
    expect(existing.expiration).toEqual(expiration)

    // Fetch it
    const gotten = await lf.get(created.publicKey, sourceURI)
    expect(gotten.expiration).toEqual(BigInt(newExpiration))
  })

  it('replace expiration backwards', async()=> {
    const lf = new LinkFactory(serviceURL, mockNonceToPrivateKey())
    const expiration = soon()

    // Create and make sure it workd
    const sourceURI = randomString()
    const targetURI = randomString()
    const { created } = await lf.create(sourceURI, targetURI, BigInt(expiration))

    // Replace
    const newExpiration = expiration - Math.floor(Math.random()* 100)
    // Modify protects
    await expect(created.modify({expiration: newExpiration}))
      .rejects.toEqual("expiration cannot decrease")

    // Manually try to force it
    await expect(lf.create(sourceURI, targetURI, newExpiration, 1, created.editorNonce))
      .rejects.toEqual("expiration cannot decrease")

    // Fetch it
    const gotten = await lf.get(created.publicKey, sourceURI)
    // Expiration does not update backwards!!
    expect(gotten.expiration).toEqual(BigInt(expiration))
  })

  it('replace source', async()=> {
    const lf = new LinkFactory(serviceURL, mockNonceToPrivateKey())
    const sourceURI = randomString()
    const targetURI = randomString()

    // Create and make sure it workd
    const { created } = await lf.create(sourceURI, targetURI, soon())

    // Replace
    const newSourceURI = randomString()
    const { created: replaced, existing } =
      await created.modify({sourceURI: newSourceURI})
    expect(replaced.sourceURI).toEqual(newSourceURI)
    expect(existing).toBeNull()

    // Fetch it
    const gotten1 = await lf.get(created.publicKey, newSourceURI)
    expect(gotten1.sourceURI).toEqual(newSourceURI)
    expect(gotten1.targetURI).toEqual(targetURI)
    await expect(lf.get(created.publicKey, sourceURI))
      .rejects.toEqual('info hash and source uri mismatch')
  })

  it('shared ownership', async()=> {
    const sharedSecret = randomString()
    const lf1 = new LinkFactory(serviceURL, mockNonceToPrivateKey(sharedSecret))
    const lf2 = new LinkFactory(serviceURL, mockNonceToPrivateKey(sharedSecret))

    const sourceURI = randomString()
    const { created } = await lf1.create(sourceURI, randomString(), soon())
    assert(created.isMine())

    const gotten = await lf2.get(created.publicKey, sourceURI)
    assert(gotten.isMine())

    const newTargetURI = randomString()
    await gotten.modify({targetURI: newTargetURI})
    const gotten2 = await lf1.get(created.publicKey, sourceURI)
    expect(gotten2.targetURI).toEqual(newTargetURI)
  })

  it('different ownership', async()=> {
    const lf1 = new LinkFactory(serviceURL, mockNonceToPrivateKey())
    const lf2 = new LinkFactory(serviceURL, mockNonceToPrivateKey())

    const sourceURI = randomString()
    const { created } = await lf1.create(sourceURI, randomString(), soon())
    assert(created.isMine())

    const gotten = await lf2.get(created.publicKey, sourceURI)
    assert(!gotten.isMine())
    const newTargetURI = randomString()
    await expect(gotten.modify({targetURI: newTargetURI}))
      .rejects.toEqual('you cannot modify a link that is not yours')

    // Manually try it
    const { created: replaced, existing } = await lf2.create(sourceURI, newTargetURI, soon(), 1, created.editorNonce)
    expect(existing).toBeUndefined()
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
    const sourceURI = randomString()
    const targetURI = randomString()
    const expiration = soon()
    const { created } = await lf.create(
      sourceURI, targetURI, expiration, maxCounter)

    // // Manually move counter backwards
    expect(lf.create(
      sourceURI, targetURI, expiration, minCounter, created.editorNonce)
    ).rejects.toEqual("counter must increase")
  })

  it('big target', async()=> {
    const lf = new LinkFactory(serviceURL, mockNonceToPrivateKey())
    const targetURI = 'x'.repeat(256 - 16 - 24 - 24)
    await lf.create(randomString(), targetURI, soon())
  })

  it('too big target', async()=> {
    const lf = new LinkFactory(serviceURL, mockNonceToPrivateKey())
    const targetURI = 'x'.repeat(256 - 16 - 24 - 24 + 1)
    await expect(lf.create(randomString(), targetURI, soon()))
      .rejects.toEqual('target URI is too big')
  })

  it('unicode', async()=> {
    const lf = new LinkFactory(serviceURL, mockNonceToPrivateKey())
    const sourceURI = '👻👩🏿‍❤️‍👩🏼👩‍👩‍👧‍👦👯‍♂️👍🏾🤜🏿𝔤𝔯𝔞𝔣𝔣𝔦𝔱𝔦🤛🏿'
    const targetURI = '👀👨🏽‍❤️‍💋‍👨🏿👨‍👨‍👧‍👧🖖🏻🫸🏼Ｇｒａｆｆｉｔｉ🫷🏼'
    const { created } = await lf.create(sourceURI, targetURI, soon())
    expect(created.sourceURI).toEqual(sourceURI)
    expect(created.targetURI).toEqual(targetURI)

    const gotten = await lf.get(created.publicKey, sourceURI)
    expect(gotten.sourceURI).toEqual(sourceURI)
    expect(gotten.targetURI).toEqual(targetURI)
  })

  it('expire', async ()=> {
    const expirationTime = 3 // seconds
    const lf = new LinkFactory(serviceURL, mockNonceToPrivateKey())
    const sourceURI = randomString()
    const targetURI = randomString()
    const expiration = Math.ceil(Date.now()/1000) + expirationTime

    // Create and fetch
    const { created } = await lf.create(sourceURI, targetURI, expiration)
    const gotten = await lf.get(created.publicKey, sourceURI)
    expect(gotten.sourceURI).toEqual(sourceURI)
    expect(gotten.targetURI).toEqual(targetURI)

    // Wait the expiration time
    await new Promise(r => setTimeout(r, (expirationTime + 1)*1000))
    await expect(lf.get(created.publicKey, sourceURI))
      .rejects.toEqual('link not found')
  }, 20000)
})