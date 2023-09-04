import TrackerSingle, { RECONNECT_TIMEOUT } from '../src/tracker-single'
import { describe, expect, it } from 'vitest'
import { randomHash, sha256Hex } from '../src/util'
import { mockServer } from './mock'

describe(`Network disconnects`, ()=> {

  it('Tracker goes offline then back on', async()=> {

    const { url } = mockServer(
      (socket, message)=> {
        try {
          const { action } = JSON.parse(message)
          if (action == 'closeme') {
            socket.close()
            return false
          } else {
            return true
          }
        } catch {
          return true
        }
      }
    )

    const updates1 = []
    const peerProof1 = await randomHash()
    const ts = new TrackerSingle(
      peerProof1,
      url,
      u=>updates1.push(u))

    const hash1 = await randomHash()
    await expect(ts.request("announce", hash1)).resolves.toEqual('pending connect')
    const hash6 = await randomHash()
    await expect(ts.request("announce", hash6)).resolves.toEqual('pending connect')

    // wait for open
    await ts.tilOpen()

    // Do a basic announce
    const hash2 = await randomHash()
    await expect(ts.request("subscribe", hash2)).resolves.toEqual('subscribed')
    const hash7 = await randomHash()
    await expect(ts.request("subscribe", hash2)).resolves.toEqual('subscribed')
    
    // And unannounce
    await expect(ts.request("unannounce", hash6)).resolves.toEqual('unannounced')

    // Close it!
    await expect(ts.request("closeme")).resolves.toEqual('pending reconnect')
    
    // Try some more
    const hash3 = await randomHash()
    await expect(ts.request("announce", hash3)).resolves.toEqual('pending connect')
    await expect(ts.request("unsubscribe", hash7)).resolves.toEqual('pending connect')

    // Wait for the timeout period
    await ts.tilOpen()
    
    // Things should be back to normal
    const hash4 = await randomHash()
    await expect(ts.request("announce", hash4)).resolves.toEqual('announced')
    const hash5 = await randomHash()
    await expect(ts.request("subscribe", hash5)).resolves.toEqual('subscribed')

    // Make sure previous subscriptions and announcements are still kept
    const updates2 = []
    const peerProof2 = await randomHash()
    const ts2 = new TrackerSingle(
      peerProof2,
      url,
      u=>updates2.push(u))

    await ts2.request("subscribe", hash1, hash3, hash4)

    await new Promise(r=> setTimeout(r, 1000))

    expect(updates2.length).toEqual(3)
    expect(updates2.map(u=>u.info_hash)).to.include.members([hash1, hash3, hash4])
    const peer1 = await sha256Hex(peerProof1)
    updates2.map(u=>u.peer).forEach(p=> expect(p).toEqual(peer1))

    expect(updates1.length).toEqual(0)
    await ts2.request("announce", hash2, hash5)

    await new Promise(r=> setTimeout(r, 1000))

    expect(updates1.length).toEqual(2)
    expect(updates1.map(u=>u.info_hash)).to.include.members([hash2, hash5])
    const peer2 = await sha256Hex(peerProof2)
    updates1.map(u=>u.peer).forEach(p=> expect(p).toEqual(peer2))
  }, 10000)

})