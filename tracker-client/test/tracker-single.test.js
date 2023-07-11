import { describe, expect, it } from 'vitest'
import TrackerSingle from '../src/tracker-single'
import { randomHash, sha256Hex } from '../src/util'

const trackerLinks = [
  "ws://localhost:8000",
  "wss://tracker.graffiti.garden"
]

trackerLinks.forEach(link=> {

async function connectToTracker(onUpdate=()=>{}) {
  return new TrackerSingle(
    await randomHash(),
    link,
    onUpdate
  )
}

describe(`Tracker Single on ${link}`, ()=> {

  it('Double connection', async()=> {
    const peerProof = await randomHash()
    const ts1 = new TrackerSingle(
      peerProof,
      link,
      ()=>{}
    )
    const ts2 = new TrackerSingle(
      peerProof,
      link,
      ()=>{}
    )

    // First will accept
    await expect(
      ts1.request("announce", await randomHash())
    ).resolves.to.equal("announced")

    // Second will reject because it is already subscribed
    await expect(
      ts2.request("announce", await randomHash())
    ).rejects.toThrowError()
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

    await new Promise(r=> setTimeout(r, 100));
    expect(numUpdates).to.equal(1)

    await expect(
      ts1.request("unannounce", hash)
    ).resolves.to.equal("unannounced")

    await new Promise(r=> setTimeout(r, 100));
    expect(numUpdates).to.equal(2)

    await expect(
      ts2.request("unsubscribe", hash)
    ).resolves.to.equal("unsubscribed")
    await expect(
      ts1.request("announce", hash)
    ).resolves.to.equal("announced")

    await new Promise(r=> setTimeout(r, 100));
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
    await new Promise(r=> setTimeout(r, 300));
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
    await new Promise(r=> setTimeout(r, 100));
    expect(numAnnounces).to.equal(1)
    await expect(
      ts.request("unsubscribe", hash)
    ).resolves.to.equal("unsubscribed")
    await expect(
      ts.request("unsubscribe", hash)
    ).resolves.to.equal("unsubscribed")
  })
})
})