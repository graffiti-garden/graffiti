import Peer from 'peerjs'
import * as jose from 'jose'
import { encoder, decoder } from './util'

export const RECONNECT_TIMEOUT = 5000

export async function encrypt(value, password) {
  // Compress with gzip
  const byteArray = encoder.encode(value)
  const cs = new CompressionStream("gzip")
  const writer = cs.writable.getWriter()
  writer.write(byteArray)
  writer.close()
  const compressedBuffer = await new Response(cs.readable).arrayBuffer()
  const compressed = new Uint8Array(compressedBuffer)
  // console.log(`compression ratio: ${compressed.length/byteArray.length}`)
  // console.log(`compressed size: ${compressed.length}`)

  // Encrypt
  return new jose.CompactEncrypt(compressed)
      .setProtectedHeader({
        alg: 'dir',
        enc: 'A128CBC-HS256',
      }).encrypt(password) // password is uint8
}

export async function decrypt(encrypted, password) {
  // Decrypt
  const { plaintext: compressed } =
    await jose.compactDecrypt(encrypted, password)

  // Decompress
  const cs = new DecompressionStream("gzip")
  const writer = cs.writable.getWriter()
  writer.write(compressed)
  writer.close()
  const decompressed = await new Response(cs.readable).arrayBuffer()
  return decoder.decode(decompressed)
}

/**
 * A wrapper around peerJS so that peers
 * can talk about multiple topics over the
 * same webRTC connection.
 * 
 * Communication over those topics is encrypted.
 * 
 * const pm = new PeerMux(myPeerID)
 * const wire = await pm.createWire(infoHash, password, onMessage)
 * await wire.send(peer, message)
 * await wire.gossip(peers, message, fanout)
 */
export default class PeerMux {

  constructor(peerID, peerjsOptions) {
    this.peerID = peerID
    this.peerjsOptions = {
      host: "peerjs.graffiti.garden",
      secure: true,
      ...(peerjsOptions?? {})
    }

    this.wires = {} // infoHash-> { password, onMessage }

    this.open()
  }

  open() {
    this.peer = new Peer(this.peerID, this.peerjsOptions)

    this._open = false
    this.connections = {} // peerID-> connection

    this.peer.once('open', ()=> {
      console.log(`Established connection to ${this.peer._options.host} with ID "${this.peer.id}"`)
      this._open = true
    })

    this.peer.once('disconnected', ()=> {
      console.error(`Lost connection to ${this.peer._options.host}, reconnecting soon...`)
      this._open = false
      this.connections = {}
      this.peer = null

      // Reconnect after timeout
      setTimeout(
        ()=> this.open(),
        RECONNECT_TIMEOUT
      )
    })

    this.errorEvents = new EventTarget()
    this.peer.on('error', e=>{
      const match = e.toString().match(/^Error: Could not connect to peer ([a-z0-9]{64})/)
      if (match && match.length >= 2) {
        const peer = match[1]
        const errorEvent = new Event(peer)
        errorEvent.error = e
        this.errorEvents.dispatchEvent(errorEvent)
        delete this.connections[peer]
      } else {
        console.error(`Peer Error: ${e}`)
      }
    })

    this.peer.on('connection', this.#onConnection.bind(this))
  }

  async isOpen() {
    if (this._open) return

    await new Promise(resolve => 
      this.peer.once('open', ()=> resolve()))
  }

  destroy() {
    this.peer.destroy()
  }

  #onConnection(connection) {
    this.connections[connection.peer] = connection
    connection.once('close', ()=> {
      delete this.connections[connection.peer]
    })
    connection.on('error', e=> console.error(e))
    connection.on('data', this.#onMessage.bind(this, connection.peer))
  }

  async #onMessage(peer, message) {
    const { infoHash, encrypted } = message
    if (!(infoHash in this.wires)) return

    const decrypted = await decrypt(encrypted, this.wires[infoHash].password)

    // Forward to the appropriate wire
    this.wires[infoHash]?.onMessage(peer, JSON.parse(decrypted))
  }

  createWire(infoHash, password, onMessage) {
    if (infoHash in this.wires)
      throw "A wire with that uri already exists"

    this.wires[infoHash] = { onMessage, password }

    const send = async (peer, message, timeout=10000)=> {
      // If sending to self, skip compression and encryption
      if (peer == this.peerID)
        return this.wires[infoHash]?.onMessage(peer, message)

      // Encrypt the message
      const encrypted = await encrypt(JSON.stringify(message), password)

      // Connect to the peer
      if (!(peer in this.connections)) {
        await this.isOpen()
        this.#onConnection(this.peer.connect(peer))
      }
      const connection = this.connections[peer]

      // Wait for it to open or error
      if (!connection.open) {
        await new Promise((resolve, reject)=> {

          let timeoutID
          const onOpen = ()=> {
            this.errorEvents.removeEventListener(peer, onError)
            clearTimeout(timeoutID)
            resolve()
          }
          const onError = e=> {
            connection.removeListener('open', onOpen)
            clearTimeout(timeoutID)
            reject(e.error)
          }
          const onTimeout = ()=> {
            connection.removeListener('open', onOpen)
            this.errorEvents.removeEventListener(peer, onError)
            reject("Timed out")
          }

          timeoutID = setTimeout(onTimeout, timeout)
          this.errorEvents.addEventListener(
            peer,
            onError,
            { once: true, passive: true })
          connection.once('open', onOpen)
        })
      }

      // And send it to the relevant peer
      connection.send({
        encrypted,
        infoHash
      })
    }

    const gossip = async (peers, message, fanout=5)=> {
      return await Promise.allSettled(
        peers
          // Shuffle the peers
          .sort(()=> 0.5 - Math.random())
          // Sample N from the shuffle
          .slice(0, fanout)
          // Map to send
          .map(peer=> send(peer, message)))
    }

    const destroy = ()=> {
      delete this.wires[infoHash]
    }

    return { send, gossip, destroy }
  }
}