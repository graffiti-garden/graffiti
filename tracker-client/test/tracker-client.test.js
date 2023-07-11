import { assert, describe, expect, it } from 'vitest'
import TrackerClient from '../tracker-client'
import { randomHash, sha256Hex } from '../src/util'

describe('Client interface', ()=> {

  it('Single tracker', async ()=>{
    const uri = "something"
    const tc1 = new TrackerClient(
      await randomHash(),
      "https://graffiti.garden")
    const tc2 = new TrackerClient(
      await randomHash(),
      "https://graffiti.garden")

    const listener = async ()=> {
      for await (const message of tc1.subscribe(uri)) {
        expect(message.action).to.equal("announce")
        expect(message.peer).to.equal(await sha256Hex(tc2.peerProof))
      }
    }
    listener()

    const result = await tc2.announce(uri)
    expect(JSON.stringify(result)).to.equal(JSON.stringify(["announced"]))
    await new Promise(r=> setTimeout(r, 100));
  })

  it('No double subscriptions', async ()=>{
    const uri = "something1"
    const tc = new TrackerClient(
      await randomHash(),
      "https://graffiti.garden")

    tc.subscribe(uri).next()
    expect(tc.subscribe(uri).next()).rejects.toThrowError()
  })

  it('Double subscription after finishing', async ()=>{
    const uri = "something2"
    const tc = new TrackerClient(
      await randomHash(),
      "https://graffiti.garden")

    const controller = new AbortController();
    const signal = controller.signal;
    tc.subscribe(uri, signal)
    controller.abort()

    await tc.announce(uri)

    const result = (await tc.subscribe(uri).next()).value
    expect(result.action).to.equal("announce")
    expect(result.peer).to.equal(await sha256Hex(tc.peerProof))
  })

  it('Unsubscribe by abort', async()=> {
    const uri = "something3"
    const tc = new TrackerClient(
      await randomHash(),
      "https://graffiti.garden")

    let actions = 0
    let timedOut = false
    const listener = async ()=> {
      try {
        for await (const message of tc.subscribe(uri, AbortSignal.timeout(400))) {
          actions++
        }
      } catch(err) {
        if (err.name === "TimeoutError") {
          timedOut = true
        }
      }
    }
    listener()

    await tc.announce(uri)
    await new Promise(r=> setTimeout(r, 800));
    expect(actions).to.equal(1)
    await tc.announce(uri)
    await new Promise(r=> setTimeout(r, 800));
    expect(actions).to.equal(1)
    assert(timedOut)
  })

  // it("Multiple Trackers", async()=> {
  //   const uri = "dfjdjfhjh"

  //   // 0 announce -> heard by 0, 1, 2
  //   // 1 announce -> heard by 0, 1
  //   // 2 announce -> heard by 0, 2
  //   const clients = [
  //     new TrackerClient(
  //       await randomHash(),
  //       "https://graffiti.garden",
  //       "http://localhost:5001"),
  //     new TrackerClient(
  //       await randomHash(),
  //       "https://graffiti.garden"),
  //     new TrackerClient(
  //       await randomHash(),
  //       "http://localhost:5001")
  //   ]
  //   const numAnnounces = [0,0,0]
  //   const peers = await Promise.all(clients.map(c=>sha256Hex(c.peerProof)))
  //   console.log(peers)

  //   const listeners = [
  //     async ()=> {
  //       for await (const message of clients[0].subscribe(uri)) {
  //         expect(message.peer).to.equal(peers[numAnnounces[0]])
  //         numAnnounces[0]++
  //       }
  //     },
  //     ...[1,2].map(i=> async()=> {
  //       for await (const message of clients[i].subscribe(uri)) {
  //         if (!numAnnounces[i]) {
  //           expect(message.peer).to.equal(peers[0])
  //         } else {
  //           expect(message.peer).to.equal(peers[i])
  //         }
  //         numAnnounces[i]++
  //       }
  //     })
  //   ]
  //   listeners.forEach(l=>l())

  //   console.log("here!")
  //   await clients[0].announce(uri)
  //   console.log("here!")
  //   await clients[1].announce(uri)
  //   console.log("here!")
  //   await clients[2].announce(uri)
  //   console.log("here!")
  //   await new Promise(r=> setTimeout(r, 1000));

  //   expect(numAnnounces[0]).to.equal(3)
  //   expect(numAnnounces[1]).to.equal(2)
  //   expect(numAnnounces[2]).to.equal(2)
  // }, 10000)

  // Test with downed trackers (they should automatically be removed)
})