import { randomBytes, concatBytes, utf8ToBytes } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { ed25519 as curve, ed25519 } from '@noble/curves/ed25519';
import { xchacha20poly1305 as cipher } from '@noble/ciphers/chacha';

const VERSION = new Uint8Array([0])
const INFO_HASH_PREFIX = 'i'
const CIPHER_PREFIX = 'c'

class Link {
  constructor(linkFactory, publicKey, containerSigned, sourceURI) {
    this.linkFactory = linkFactory
    this.publicKey = publicKey
    this.sourceURI = sourceURI

    // Verify the signature
    const container = containerSigned.slice(0, containerSigned.byteLength-64)
    const signature = containerSigned.slice(containerSigned.byteLength-64)
    if (!ed25519.verify(signature, container, publicKey)) {
      throw "invalid signature"
    }

    const view = new DataView(container.buffer)
    let byteOffset = 0

    // Make sure we understand the data
    const version = view.getUint8(byteOffset)
    if (version != 0) {
      throw "i only understand version zero"
    }
    byteOffset += 1

    // Verify the info hash
    const infoHash = container.slice(byteOffset, byteOffset+32)
    byteOffset += 32
    const infoHashPrivateKey = sha256(INFO_HASH_PREFIX + sourceURI)
    const infoHashDerived = curve.getPublicKey(infoHashPrivateKey)
    if (!infoHash.every((val, i)=> val == infoHashDerived[i])) {
      throw "info hash and source uri mismatch"
    }

    // Verify the pok
    const pok = container.slice(byteOffset, byteOffset+64)
    byteOffset += 64
    if (!ed25519.verify(pok, publicKey, infoHash)) {
      throw "invalid proof of knowledge"
    }

    // Unpack the integers
    this.counter    = view.getBigInt64(byteOffset)
    byteOffset += 8
    this.expiration = view.getBigInt64(byteOffset)
    byteOffset += 8

    // Unpack the nonce
    this.editorNonce = container.slice(byteOffset, byteOffset+24)
    byteOffset += 24

    // Decrypt the target
    const cipherKey = sha256(CIPHER_PREFIX + sourceURI)
    const cipherNonce = container.slice(byteOffset, byteOffset+24)
    byteOffset += 24
    const targetURIEncrypted = container.slice(byteOffset)
    let targetURIBytes
    try {
      targetURIBytes = cipher(cipherKey, cipherNonce).decrypt(targetURIEncrypted)
    } catch {
      throw "source URI does not decode the target"
    }
    this.targetURI = new TextDecoder().decode(targetURIBytes)
  }

  isMine() {
    // Generate the public key from the nonce
    const privateKey =
     this.linkFactory.editorNonceToPrivateKey(this.editorNonce)
    const publicKey  = curve.getPublicKey(privateKey)

    // And make sure they are equal
    return publicKey.every((val, i)=> val == this.publicKey[i])
  }

  async modify({sourceURI, targetURI, expiration}) {
    // Perform validation (even though server
    // would do this too)
    if (!this.isMine())
      throw "you cannot modify a link that is not yours"
    if (expiration < this.expiration)
      throw "expiration cannot decrease"

    return await this.linkFactory.create(
      sourceURI ?? this.sourceURI, 
      targetURI ?? this.targetURI,
      expiration ?? this.expiration,
      this.counter + 1n,
      this.editorNonce
    )
  }
}

export default class LinkFactory {

  constructor(serviceURL, editorNonceToPrivateKey) {
    this.serviceURL = serviceURL
    this.editorNonceToPrivateKey = editorNonceToPrivateKey
  }

  #publicKeyToURL(publicKey) {
    // Encode the public key in base 64
    const publicKeyBase64 =
      btoa(String.fromCodePoint(...publicKey))
      // Make sure it is url safe
      .replace(/\+/g, '-')
      .replace(/\//g, '_')

    return `${this.serviceURL}/${publicKeyBase64}`
  }

  parse(publicKey, containerSigned, sourceURI) {
    return new Link(this, publicKey, containerSigned, sourceURI)
  }

  async get(publicKey, sourceURI) {
    const response = await fetch(this.#publicKeyToURL(publicKey))
    if (response.status != 200) {
      throw await response.text()
    } else {
      return this.parse(
        publicKey,
        new Uint8Array(await response.arrayBuffer()),
        sourceURI
      )
    }
  }

  async create(sourceURI, targetURI, expiration, counter=0, editorNonce=null) {
    // Make sure that the source and target are strings
    for (const uri in [sourceURI, targetURI]) {
      if (typeof uri != 'string') {
        throw `URI must be a string : ${uri}`
      }
    }

    // Convert expiration to seconds to big int
    expiration = BigInt(expiration)
    counter = BigInt(counter)

    // Generate editing nonce
    editorNonce = editorNonce ?? randomBytes(24)
    if (ArrayBuffer.isView(editorNonce) && editorNonce.byteLength != 24) {
      throw "editor nonce is must be 24 random bytes"
    }

    // Derive editor public and private keys from the salt
    const privateKey = this.editorNonceToPrivateKey(editorNonce)
    const publicKey  = curve.getPublicKey(privateKey)

    // Derive the infohash and proof of knowledge
    const infoHashPrivateKey = sha256(INFO_HASH_PREFIX + sourceURI)
    const infoHash = curve.getPublicKey(infoHashPrivateKey)
    const pok = curve.sign(publicKey, infoHashPrivateKey)

    // Turn the counter and expiration into
    // unsigned long long bytes (big-endian)
    const intBuffer = new ArrayBuffer(16)
    const intView = new DataView(intBuffer)
    intView.setBigInt64(0, counter)
    intView.setBigInt64(8, expiration)
    const intBytes = new Uint8Array(intBuffer)

    // Encrypt the payload using the uri
    const cipherKey = sha256(CIPHER_PREFIX + sourceURI)
    const cipherNonce = randomBytes(24)
    const targetURIEncrypted =
      cipher(cipherKey, cipherNonce).encrypt(
        utf8ToBytes(targetURI)
      )
    // 256 minus two 24-byte nonces
    if (targetURIEncrypted.length > 208) {
      throw "target URI is too big"
    }

    // Pack it all together
    const container = concatBytes(
      VERSION,
      infoHash,
      pok,
      intBytes,
      editorNonce,
      cipherNonce,
      targetURIEncrypted
    )

    // Sign the container
    const signature = curve.sign(container, privateKey)
    const containerSigned = concatBytes(container, signature)

    // Send the container on over
    const response = await fetch(
      this.#publicKeyToURL(publicKey), {
      method: 'PUT',
      body: containerSigned
    })

    // If it's an error throw it
    if (response.status != 200) {
      throw await response.text()
    } else {
      const output = {
        created: this.parse(publicKey, containerSigned, sourceURI)
      }

      // Include existing data if it exists
      const oldContainerSigned = new Uint8Array(await response.arrayBuffer())
      if (oldContainerSigned.byteLength) {
        try {
          output.existing = this.parse(publicKey, oldContainerSigned, sourceURI)
        } catch {
          output.existing = null
        }
      }

      return output
    }
  }
}