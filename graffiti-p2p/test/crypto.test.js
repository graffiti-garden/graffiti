import { describe, expect, it } from 'vitest'
import { encrypt, decrypt, sign, verify } from "../src/crypto"
import { actorClientMock } from './mock'

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
    await sign({
      path: crypto.randomUUID(),
      actor
    }, actorClient)
  })

  for (const context of [
    [],
    ["hi"],
    ["hi", "ho"]
  ]) {
    it(`sign with valid context: ${JSON.stringify(context)}`, async ()=> {
      await sign({
        path: crypto.randomUUID(),
        actor,
        context
      }, actorClient)
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
      expect(sign({
        path: crypto.randomUUID(),
        actor,
        context
      }, actorClient)).rejects.toThrowError()
    })
  }

  it(`sign and verify with path`, async ()=> {
    const path = crypto.randomUUID()
    const { signed, unsigned } = await sign({
      path,
      actor,
      something: "hello"
    }, actorClient)

    const { unsigned: unsignedOut, actor: actorOut, value } =
     await verify(signed, actorClient, { path })

    expect(actorOut).to.equal(actor)
    expect(unsigned.updated).to.equal(unsignedOut.updated)
    expect(value.something).to.equal("hello")
  })

  it(`sign and verify with context`, async ()=> {
    const contextPath = crypto.randomUUID()
    const { unsigned, signed } = await sign({
      path: crypto.randomUUID(),
      actor,
      hello: "world",
      context: [contextPath]
    }, actorClient)

    const { unsigned: unsignedOut, actor: actorOut, value } =
     await verify(signed, actorClient, { contextPath })

    expect(actorOut).to.equal(actor)
    expect(unsigned.updated).to.equal(unsignedOut.updated)
    expect(value.hello).to.equal("world")
  })

  it(`sign and verify without either`, async ()=> {
    const { unsigned, signed } = await sign({
      path: crypto.randomUUID(),
      actor,
      something: "hello"
    }, actorClient)

    const { unsigned: unsignedOut, actor: actorOut, value } =
     await verify(signed, actorClient, {})

    expect(actorOut).to.equal(actor)
    expect(unsigned.updated).to.equal(unsignedOut.updated)
    expect(value).to.equal(null)
  })

  it(`verify with wrong context`, async ()=> {
    const { unsigned, signed } = await sign({
      path: crypto.randomUUID(),
      actor,
      hello: "world",
      context: [crypto.randomUUID()]
    }, actorClient)

    const { unsigned: unsignedOut, actor: actorOut, value } =
     await verify(signed, actorClient, { contextPath: crypto.randomUUID() })

    expect(actorOut).to.equal(actor)
    expect(unsigned.updated).to.equal(unsignedOut.updated)
    expect(value).to.equal(null)
  })

  it(`verify with wrong path`, async ()=> {
    const { signed } = await sign({
      path: crypto.randomUUID(),
      actor
    }, actorClient)

    expect(verify(signed, actorClient, { path: crypto.randomUUID() })).rejects.toThrowError()
  })

  // TODO:
  // - artificially constructed, wrong thigns to verify
  // - Path and actor shouldn't ever actually be set
})