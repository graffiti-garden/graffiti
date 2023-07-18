import { describe, expect, it } from 'vitest'
import P2PWrapper from "../src/p2p-wrapper"
import { randomHash } from '../src/util'

describe('P2P Wrapper', ()=> {

  const options = {
    // trackers: ["wss://tracker.graffiti.garden"]
    trackers: ["ws://localhost:8000"]
  }

  it('repeated get and destroy', async ()=> {

    class Test {
      static toURI(a, b) {
        return a+b
      }
    }

    const pw = new P2PWrapper(options)
    const t1 = await pw.get(Test, "one", "two")

    expect(pw.get(Test, "one", "two")).resolves.to.equal(t1)

    expect(pw.get(Test, "one", "three")).resolves.to.not.equal(t1)

    await pw.delete(Test, "one", "two")

    expect(pw.get(Test, "one", "two")).resolves.to.not.equal(t1)
  })

  it('one wrapper to another', async ()=> {
    const uri = await randomHash()

    class Test {

      static toURI() {
        return uri
      }

      constructor() {
        this.announced = []
        this.unannounced = []
        this.messages = []
      }

      onAnnounce(peer) {
        this.announced.push(peer)
      }

      onUnannounce(peer) {
        this.unannounced.push(peer)
      }

      onMessage(peer, message) {
        this.messages.push([peer, message])
      }
    }

    // Create two independent wrappers
    const pw1 = new P2PWrapper(options)
    const t1 = await pw1.get(Test)

    await new Promise(r=> setTimeout(r, 1500));

    const pw2 = new P2PWrapper(options)
    const t2 = await pw2.get(Test)

    // Wait a bit
    await new Promise(r=> setTimeout(r, 1500));
  
    // Make sure announcement of first is seen in second and vice versa
    expect(t1.announced.length).to.equal(1)
    expect(t2.announced.length).to.equal(1)
    expect(t1.announced[0]).to.equal(pw2.peer)
    expect(t2.announced[0]).to.equal(pw1.peer)

    // Send a message from one to the other
    await t1.wire.send(pw2.peer, "hello")
    await new Promise(r=> setTimeout(r, 1500));
    expect(t2.messages.length).to.equal(1)
    expect(t2.messages[0][0]).to.equal(pw1.peer)
    expect(t2.messages[0][1]).to.equal("hello")
  
    // Delete the first peer and make sure an
    // unannounce is seen by the other
    await pw1.delete(Test)
    await new Promise(r=> setTimeout(r, 1500));
    expect(t2.unannounced.length).to.equal(1)
    expect(t2.unannounced[0]).to.equal(pw1.peer)
  }, 10000)
})