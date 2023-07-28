import { assert, describe, expect, it } from 'vitest'
import TrackerClient from '../tracker-client'
import { randomHash, sha256Hex } from '../src/util'

const trackerLinks = [
  "ws://localhost:8000",
  "wss://tracker.graffiti.garden"
]

trackerLinks.forEach(link=> {

describe('Client interface with single tracker', ()=> {

  it('basic announce subscribe', async ()=>{
    const uri = "something"
    const tc1 = new TrackerClient(
      await randomHash(),
      [link])
    const tc2 = new TrackerClient(
      await randomHash(),
      [link])

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
      [link])

    tc.subscribe(uri).next()
    expect(tc.subscribe(uri).next()).rejects.toThrowError()
  })

  it('Double subscription after finishing', async ()=>{
    const uri = "something2"
    const tc = new TrackerClient(
      await randomHash(),
      [link])

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
      [link])

    let actions = 0
    let timedOut = false
    const listener = async ()=> {
      try {
        for await (const message of tc.subscribe(uri, AbortSignal.timeout(3000))) {
          actions++
        }
      } catch(err) {
        if (err.name === "TimeoutError") {
          timedOut = true
        }
      }
    }
    listener()

    await new Promise(r=> setTimeout(r, 2000));
    await tc.announce(uri)
    await new Promise(r=> setTimeout(r, 2000));
    expect(actions).to.equal(1)
    await tc.announce(uri)
    await new Promise(r=> setTimeout(r, 2000));
    expect(actions).to.equal(1)
    assert(timedOut)
  }, 10000)
})
})