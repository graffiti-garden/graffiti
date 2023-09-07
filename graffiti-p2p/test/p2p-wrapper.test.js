import { describe, expect, assert, it } from 'vitest'
import P2PWrapper from "../src/p2p-wrapper"
import { randomHash } from '../src/util'
import { actorClientMock } from './mock'

const { actorClient } = actorClientMock()

describe('P2P Wrapper', async ()=> {

  it('repeated get and destroy', async ()=> {

    class Test {
      static toURI(a, b) {
        return a+b
      }
    }

    const pw = new P2PWrapper(actorClient)
    const t1 = pw.get(Test, "one", "two")

    expect(pw.get(Test, "one", "two")).to.equal(t1)

    expect(pw.get(Test, "one", "three")).to.not.equal(t1)

    await pw.delete(Test, "one", "two")

    expect(pw.get(Test, "one", "two")).to.not.equal(t1)
  })

  it('one wrapper to another', async ()=> {
    const uri = await randomHash()

    class Test {

      static toURI() {
        return uri
      }

      constructor() {
        this.announced = []
        this.messages = []
      }

      onAnnounce(peer) {
        this.announced.push(peer)
      }

      onMessage(peer, message) {
        this.messages.push([peer, message])
      }
    }

    // Create two independent wrappers
    const pw1 = new P2PWrapper(actorClient)
    const t1 = pw1.get(Test)
    const pw2 = new P2PWrapper(actorClient)
    const t2 = pw2.get(Test)

    // Immediately send
    await pw1.isOpen()
    await pw2.isOpen()
    await t1.send(pw2.peer, "hello")

    // Wait a bit for everything to resolve
    await new Promise(r=> setTimeout(r, 1500));
  
    // Make sure announcement of first is seen in second and vice versa
    expect(t1.announced.length).to.equal(1)
    expect(t2.announced.length).to.equal(1)
    expect(t1.announced[0]).to.equal(pw2.peer)
    expect(t2.announced[0]).to.equal(pw1.peer)

    expect(t1.peers.size).to.equal(1)
    expect(t2.peers.size).to.equal(1)
    assert(t1.peers.has(pw2.peer))
    assert(t2.peers.has(pw1.peer))

    // Make sure message is seen
    expect(t2.messages.length).to.equal(1)
    expect(t2.messages[0][0]).to.equal(pw1.peer)
    expect(t2.messages[0][1]).to.equal("hello")
  
    // Delete the first peer and make sure an
    // unannounce is seen by the other
    await pw1.delete(Test)
    await new Promise(r=> setTimeout(r, 1500));
    expect(t2.peers.size).to.equal(0)
  }, 10000)
})