import { describe, expect, it } from 'vitest'
import { encrypt, decrypt, sign, verify } from "../src/crypto"
import { actorClientMock } from './mock'
import { sha256Hex } from '../src/util'

describe('Crypto', async ()=> {

  const { actor, actorClient } = actorClientMock()

  it('encrypt and decrypt', async ()=> {
    const password = "password12345"
    const original = "hi this is v secrt hehe"

    const encrypted = await encrypt(original, password)
    const decrypted = await decrypt(encrypted, password)

    expect(decrypted).to.equal(original)
  })

  it('decrypt without password', async ()=> {
    const encrypted = await encrypt("somethingg secret", "password")
    expect(decrypt(encrypted, "wrong pasword")).rejects.toThrowError()
  })

  it('sign', async ()=> {
    await sign({}, actor, crypto.randomUUID(), actorClient)
  })

  for (const context of [
    [],
    ["hi"],
    ["hi", "ho"]
  ]) {
    it(`sign with valid context: ${JSON.stringify(context)}`, async ()=> {
      await sign({ context }, actor, crypto.randomUUID(), actorClient)
    })
  }

  for (const context of [
      null,
      false,
      1234,
      "hi",
      {},
      [1234],
      ["something", 1234],
      [[]],
      [{}]
  ]) {
    it(`sign with invalid context: ${JSON.stringify(context)}`, async ()=> {
      expect(sign({ context }, actor, crypto.randomUUID(), actorClient)).rejects.toThrowError()
    })
  }

  it(`sign and verify with path`, async ()=> {
    const path = crypto.randomUUID()
    const { signed, updated, pathHash } = await sign({
      something: "hello"
    }, actor, path, actorClient)

    const { updated: updatedOut, pathHash: pathHashOut, actor: actorOut, value } =
     await verify(signed, actorClient, { path })

    expect(actorOut).to.equal(actor)
    expect(updatedOut).to.equal(updated)
    expect(pathHashOut).to.equal(pathHash)
    expect(value.something).to.equal("hello")
  })

  it(`sign and verify with context`, async ()=> {
    const contextPath = crypto.randomUUID()
    const { signed, updated, pathHash } = await sign({
      hello: "world",
      context: [contextPath]
    }, actor, crypto.randomUUID(), actorClient)

    const { updated: updatedOut, pathHash: pathHashOut, actor: actorOut, value } =
     await verify(signed, actorClient, { contextPath })

    expect(actorOut).to.equal(actor)
    expect(updatedOut).to.equal(updated)
    expect(pathHashOut).to.equal(pathHash)
    expect(value.hello).to.equal("world")
  })

  it(`sign and verify without either`, async ()=> {
    const { updated, signed } = await sign({
      something: "hello"
    }, actor, crypto.randomUUID(), actorClient)

    const { updated: updatedOut, actor: actorOut, value } =
     await verify(signed, actorClient, {})

    expect(actorOut).to.equal(actor)
    expect(updated).to.equal(updatedOut)
    expect(value).to.equal(null)
  })

  it(`sign and verify with wrong hash`, async ()=> {
    const { signed } = await sign({
      something: "hello"
    }, actor, crypto.randomUUID(), actorClient)

    await expect(verify(signed, actorClient, {signedHash: "1234"})).rejects.toThrowError()
  })

  it(`sign and verify with right hash`, async ()=> {
    const { signed } = await sign({
      something: "hello"
    }, actor, crypto.randomUUID(), actorClient)
    const signedHash = await sha256Hex(signed)

    await verify(signed, actorClient, { signedHash })
  })

  it(`verify with wrong context`, async ()=> {
    const { updated, signed } = await sign({
      hello: "world",
      context: [crypto.randomUUID()]
    }, actor, crypto.randomUUID(), actorClient)

    const { updated: updatedOut, actor: actorOut, value } =
     await verify(signed, actorClient, { contextPath: crypto.randomUUID() })

    expect(actorOut).to.equal(actor)
    expect(updated).to.equal(updatedOut)
    expect(value).to.equal(null)
  })

  it(`verify with wrong path`, async ()=> {
    const { signed } = await sign({}, actor, crypto.randomUUID(), actorClient)

    expect(verify(signed, actorClient, { path: crypto.randomUUID() })).rejects.toThrowError()
  })

  for (const object of [
    { actor: crypto.randomUUID() },
    { path: crypto.randomUUID() },
    { id:   crypto.randomUUID() },
    { actor:   false },
    { actor:   true },
    { actor:   1234 },
    { actor:   "skdfjkj" },
    { actor:   "skdfjkj" , path: "123k4jkj"},
  ]) {
    it(`fails with bad object: ${JSON.stringify(object)}`, async ()=> {
      expect(sign(object, actor, crypto.randomUUID(), actorClient)).rejects.toThrowError()
    })
  }

  // TODO:
  // - artificially constructed, wrong thigns to verify
})