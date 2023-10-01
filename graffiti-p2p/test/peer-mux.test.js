import { describe, expect, it } from 'vitest'
import PeerMux, { RECONNECT_TIMEOUT } from '../src/peer-mux'
import { randomHash, sha256Hex, sha256Uint8 } from '../src/util'

const options = {
  'localhost': {
    host: 'localhost',
    port: '9000',
    secure: false
  },
  'graffiti.garden': {}
}

for (const [name, peerJSOptions] of Object.entries(options)) {

describe(`Peer Mux ${name}`, ()=> {

  it("Peers send each other", async ()=> {

    const m1 = new PeerMux(await randomHash(), peerJSOptions)
    const m2 = new PeerMux(await randomHash(), peerJSOptions)

    await m1.isOpen()
    await m2.isOpen()

    let m1Received = 0
    let m2Received = 0
    const infoHash = await sha256Hex("something")
    const password = await sha256Uint8("password12345")
    const { send: send1 } = m1.createWire(infoHash, password, (peer, m)=>{
      expect(peer).to.equal(m2.peer.id)
      expect(m).to.equal("hello from m2")
      m1Received++
    })
    const { send: send2 } = m2.createWire(infoHash, password, (peer, m)=>{
      expect(peer).to.equal(m1.peer.id)
      expect(m).to.equal("hello from m1")
      m2Received++
    })

    await send1(m2.peer.id, "hello from m1")

    await new Promise(r=> setTimeout(r, 1000));

    expect(m1Received).to.equal(0)
    expect(m2Received).to.equal(1)

    await send2(m1.peer.id, "hello from m2")

    await new Promise(r=> setTimeout(r, 1000));

    expect(m1Received).to.equal(1)
    expect(m2Received).to.equal(1)
  }, 10000)

  it("Peers send on different channels", async ()=> {

    const m1 = new PeerMux(await randomHash(), peerJSOptions)
    const m2 = new PeerMux(await randomHash(), peerJSOptions)

    await m1.isOpen()
    await m2.isOpen()

    let m1Received = 0
    let m2Received = 0
    const infoHash1 = await sha256Hex("something1")
    const infoHash2 = await sha256Hex("something2")
    const password = await sha256Uint8("password12345")
    const { send: send1 } = m1.createWire(infoHash1, password, (peer, m)=>{
      m1Received++
    })
    const { send: send2 } = m2.createWire(infoHash2, password, (peer, m)=>{
      m2Received++
    })

    await send1(m2.peer.id, "hello from m1")

    await new Promise(r=> setTimeout(r, 1000));

    expect(m1Received).to.equal(0)
    expect(m2Received).to.equal(0)

    await send2(m1.peer.id, "hello from m2")

    await new Promise(r=> setTimeout(r, 1000));

    expect(m1Received).to.equal(0)
    expect(m2Received).to.equal(0)
  }, 10000)

  it("Wrong password", async ()=> {

    const m1 = new PeerMux(await randomHash(), peerJSOptions)
    const m2 = new PeerMux(await randomHash(), peerJSOptions)

    await m1.isOpen()
    await m2.isOpen()

    let m1Received = 0
    let m2Received = 0
    const infoHash = await sha256Hex("something!")
    const password1 = await sha256Uint8("password12345")
    const password2 = await sha256Uint8("birthday-pet")
    const { send: send1 } = m1.createWire(infoHash, password1, (peer, m)=>{
      m1Received++
    })
    const { send: send2 } = m2.createWire(infoHash, password2, (peer, m)=>{
      m2Received++
    })

    await send1(m2.peer.id, "hello from m1")

    await new Promise(r=> setTimeout(r, 1000));

    expect(m1Received).to.equal(0)
    expect(m2Received).to.equal(0)

    await send2(m1.peer.id, "hello from m2")

    await new Promise(r=> setTimeout(r, 1000));

    expect(m1Received).to.equal(0)
    expect(m2Received).to.equal(0)
  }, 10000)

  it("Peers disconnect", async ()=> {

    const m1 = new PeerMux(await randomHash(), peerJSOptions)
    const m2 = new PeerMux(await randomHash(), peerJSOptions)

    await m1.isOpen()
    await m2.isOpen()

    let m1Received = 0
    let m2Received = 0
    const infoHash = await sha256Hex("something")
    const password = await sha256Uint8("password12345")
    const { send: send1 } = m1.createWire(infoHash, password, (peer, m)=>{
      m1Received++
    })
    const { send: send2 } = m2.createWire(infoHash, password, (peer, m)=>{
      m2Received++
    })

    await send1(m2.peer.id, "hello from m1")

    await new Promise(r=> setTimeout(r, 500));

    expect(m1Received).to.equal(0)
    expect(m2Received).to.equal(1)

    // Destroy peer 1!
    const m1id = m1.peer.id
    m1.destroy()
    await new Promise(r=> setTimeout(r, 500));

    await expect(send1(m2.peer.id, "hello from m1")).rejects.toThrowError()
    await new Promise(r=> setTimeout(r, 500));
    await expect(send1(m2.peer.id, "hello from m1")).rejects.toThrowError()

    await expect(send2(m1id, "hello from m2", 1000)).rejects.toThrowError()
    await new Promise(r=> setTimeout(r, 500));
    await expect(send2(m1id, "hello from m2", 1000)).rejects.toThrowError()
  }, 10000)

  it("Peers reconnect", async ()=> {

    const m1 = new PeerMux(await randomHash(), peerJSOptions)
    const m2 = new PeerMux(await randomHash(), peerJSOptions)

    let m1Received = 0
    let m2Received = 0
    const infoHash = await sha256Hex("something~~")
    const password = await sha256Uint8("password12345")
    const { send: send1 } = m1.createWire(infoHash, password, (peer, m)=>{
      m1Received++
    })
    const { send: send2 } = m2.createWire(infoHash, password, (peer, m)=>{
      m2Received++
    })

    await m1.isOpen()
    await m2.isOpen()

    // Destroy peer 1!
    const m1id = m1.peer.id
    m1.destroy()

    await expect(send1(m2.peer.id, "hello from m1")).rejects.toThrowError()
    await expect(send2(m1id, "hello from m2", 1000)).rejects.toThrowError()

    await new Promise(r=> setTimeout(r, 500));
    expect(m1Received).toEqual(0)

    // Wait for reconnect
    await new Promise(r=> setTimeout(r, RECONNECT_TIMEOUT))

    await send1(m2.peer.id, "hello from m1 now")
    await new Promise(r=> setTimeout(r, 500));
    expect(m2Received).toEqual(1)
  }, 20000)

  async function gossipToPeers(numPeers, fanout) {

    const peerMuxes = await Promise.all(
      Array(numPeers).fill().map(async ()=>
        new PeerMux(await randomHash())))
    await Promise.all(peerMuxes.map(m=> m.isOpen()))

    const received = {}
    const infoHash = await randomHash()
    const password = await sha256Uint8('')
    const message = await randomHash()
    const wires = await Promise.all(peerMuxes.map(receivingMux=>
      receivingMux.createWire(infoHash, password, (sendingPeer, m)=> {
        expect(sendingPeer).to.equal(peerMuxes[0].peer.id)
        expect(m).to.equal(message)
        expect(received).to.not.have.property(receivingMux.peer.id)
        received[receivingMux.peer.id] = true
      })))

    await wires[0].gossip(peerMuxes.map(m=> m.peer.id), message, fanout)

    await new Promise(r=> setTimeout(r, 1000));

    expect(Object.keys(received).length).to.equal(Math.min(fanout, numPeers))
  }

  it("Peer gossip 1,6", async ()=> {
    await gossipToPeers(1, 6)
  }, 10000)

  it("Peer gossip 6,1", async ()=> {
    await gossipToPeers(6, 1)
  }, 10000)

  it("Peer gossip 5,0", async ()=> {
    await gossipToPeers(5, 0)
  }, 10000)

  it("Peer gossip 3,3", async ()=> {
    await gossipToPeers(3, 3)
  }, 10000)

  it("Peer gossip 3,4", async ()=> {
    await gossipToPeers(3, 4)
  }, 10000)

  it("Peer gossip 10,5", async ()=> {
    await gossipToPeers(10, 5)
  }, 10000)
})

}