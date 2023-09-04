import { describe, expect, it } from 'vitest'
import TrackerSingle from '../src/tracker-single'
import { randomHash, sha256Hex } from '../src/util'

const trackerLinks = [
  "ws://localhost:8000",
  "wss://tracker.graffiti.garden"
]
const timeoutTime = 500

trackerLinks.forEach(link=> {

async function connectToTracker(onUpdate=()=>{}) {
  const ts = new TrackerSingle(
    await randomHash(),
    link,
    onUpdate
  )
  await ts.tilOpen()
  return ts
}

describe(`Tracker Single on ${link}`, ()=> {

  it('Downed tracker', async()=> {
    const ts = new TrackerSingle(
      await randomHash(),
      "ws://tracker.example.com",
      ()=>{})

    // Expect this to hang
    await expect(Promise.race([
      ts.tilOpen(),
      new Promise(r=> setTimeout(()=> r("timedout"), 1000))
    ])).resolves.toEqual("timedout")
  })

  it('Double connection', async()=> {
    const peerProof = await randomHash()
    const ts1 = new TrackerSingle(
      peerProof,
      link,
      ()=>{}
    )

    // First will accept
    await ts1.tilOpen()

    const ts2 = new TrackerSingle(
      peerProof,
      link,
      ()=>{}
    )

    // Second will hang because there is already a subscription
    await expect(Promise.race([
      // Expect this to hang
      ts2.tilOpen(),
      new Promise(r=> setTimeout(()=> r("timedout"), 1000))
    ])).resolves.toEqual("timedout")
  })

  it('Error on invalid hash', async () => {
    const ts = await connectToTracker()
    await expect(
      ts.request("announce", "1234")
    ).rejects.toThrowError()
  })

  it('Announced correct hash', async () => {
    const ts = await connectToTracker()
    await expect(
      ts.request("announce", await randomHash())
    ).resolves.to.equal("announced")
  })

  it('Multiple hashes', async () => {
    const ts = await connectToTracker()
    await expect(
      ts.request("announce",
      await randomHash(),
      await randomHash())
    ).resolves.to.equal("announced")
  })

  it('Invalid action', async () => {
    const ts = await connectToTracker()
    await expect(
      ts.request("actnow",
      await randomHash(),
      await randomHash())
    ).rejects.toThrowError()
  })

  it('sub->ann->unann->unsub->ann', async () => {
    let numUpdates = 0

    const hash = await randomHash()
    const ts1 = await connectToTracker()
    const ts2 = await connectToTracker(
      async (update)=> {
        expect(update.peer).to.equal(await sha256Hex(ts1.peerProof))
        expect(update.info_hash).to.equal(hash)
        if (!numUpdates) {
          expect(update.action).to.equal("announce")
        } else {
          expect(update.action).to.equal("unannounce")
        }
        numUpdates++
      }
    )

    await expect(
      ts2.request("subscribe", hash)
    ).resolves.to.equal("subscribed")
    await expect(
      ts1.request("announce", hash)
    ).resolves.to.equal("announced")

    await new Promise(r=> setTimeout(r, timeoutTime));
    expect(numUpdates).to.equal(1)

    await expect(
      ts1.request("unannounce", hash)
    ).resolves.to.equal("unannounced")

    await new Promise(r=> setTimeout(r, timeoutTime));
    expect(numUpdates).to.equal(2)

    await expect(
      ts2.request("unsubscribe", hash)
    ).resolves.to.equal("unsubscribed")
    await expect(
      ts1.request("announce", hash)
    ).resolves.to.equal("announced")

    await new Promise(r=> setTimeout(r, timeoutTime));
    expect(numUpdates).to.equal(2)
  })

  it("Disconnect unannounce", async ()=>{
    let numUpdates = 0
    const hash = await randomHash()
    const ts1 = await connectToTracker()
    const ts2 = await connectToTracker(
      async (update)=> {
        expect(update.peer).to.equal(await sha256Hex(ts1.peerProof))
        expect(update.info_hash).to.equal(hash)
        if (!numUpdates) {
          expect(update.action).to.equal("announce")
        } else {
          expect(update.action).to.equal("unannounce")
        }
        numUpdates++
      }
    )

    await expect(
      ts2.request("subscribe", hash)
    ).resolves.to.equal("subscribed")
    await expect(
      ts1.request("announce", hash)
    ).resolves.to.equal("announced")

    ts1.close()
    await new Promise(r=> setTimeout(r, timeoutTime));
    expect(numUpdates).to.equal(2)
  })

  it("Double subscription", async ()=>{
    let numAnnounces = 0
    const hash = await randomHash()
    const ts = await connectToTracker(update=> {
      expect(update.action).to.equal("announce")
      numAnnounces++
    })
    await expect(
      ts.request("subscribe", hash)
    ).resolves.to.equal("subscribed")
    await expect(
      ts.request("subscribe", hash)
    ).resolves.to.equal("subscribed")
    await expect(
      ts.request("announce", hash)
    ).resolves.to.equal("announced")
    await new Promise(r=> setTimeout(r, timeoutTime));
    expect(numAnnounces).to.equal(1)
    await expect(
      ts.request("unsubscribe", hash)
    ).resolves.to.equal("unsubscribed")
    await expect(
      ts.request("unsubscribe", hash)
    ).resolves.to.equal("unsubscribed")
  }, 10000)

  it("Previous and future announces", async ()=>{
    let announced1 = [] 
    const ts1 = await connectToTracker(async update=> {
      expect(update.action).to.equal("announce")
      if (update.peer != await sha256Hex(ts1.peerProof)) {
        announced1.push(update.peer)
      }
    })
    let announced2 = []

    const ts2 = await connectToTracker(async update=> {
      expect(update.action).to.equal("announce")
      if (update.peer != await sha256Hex(ts2.peerProof)) {
        announced2.push(update.peer)
      }
    })

    const hash = await randomHash()
    await expect(
      ts1.request("announce", hash)
    ).resolves.to.equal("announced")
    await expect(
      ts1.request("subscribe", hash)
    ).resolves.to.equal("subscribed")
    await expect(
      ts2.request("subscribe", hash)
    ).resolves.to.equal("subscribed")
    await expect(
      ts2.request("announce", hash)
    ).resolves.to.equal("announced")
    await new Promise(r=> setTimeout(r, timeoutTime));

    expect(announced1.length).to.equal(1)
    expect(announced2.length).to.equal(1)
    expect(announced1[0]).to.equal(await sha256Hex(ts2.peerProof))
    expect(announced2[0]).to.equal(await sha256Hex(ts1.peerProof))
  })
})
})