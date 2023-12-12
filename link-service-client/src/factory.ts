import { randomBytes, concatBytes, utf8ToBytes } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { ed25519 as curve } from '@noble/curves/ed25519';
import { xchacha20poly1305 as cipher } from '@noble/ciphers/chacha';
import { PUT_VERSION, INFO_HASH_PREFIX, CIPHER_PREFIX } from './constants'
const decoder = new TextDecoder()

export class Link {
  #linkFactory: LinkFactory
  publicKey: Uint8Array
  source: string
  target: string
  counter: bigint
  expiration: bigint
  editorNonce: Uint8Array

  constructor(linkFactory: LinkFactory, publicKey: Uint8Array, containerSigned: Uint8Array, source: string) {
    this.#linkFactory = linkFactory
    this.publicKey = publicKey
    this.source = source

    // Verify the signature
    const container = containerSigned.slice(0, containerSigned.byteLength-64)
    const signature = containerSigned.slice(containerSigned.byteLength-64)
    if (!curve.verify(signature, container, publicKey)) {
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
    const infoHashPrivateKey = sha256(INFO_HASH_PREFIX + source)
    const infoHashDerived = curve.getPublicKey(infoHashPrivateKey)
    if (!infoHash.every((val, i)=> val == infoHashDerived[i])) {
      throw "info hash and source mismatch"
    }

    // Verify the pok
    const pok = container.slice(byteOffset, byteOffset+64)
    byteOffset += 64
    if (!curve.verify(pok, publicKey, infoHash)) {
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
    const cipherKey = sha256(CIPHER_PREFIX + source)
    const cipherNonce = container.slice(byteOffset, byteOffset+24)
    byteOffset += 24
    const targetEncrypted = container.slice(byteOffset)
    let targetBytes: Uint8Array
    try {
      targetBytes = cipher(cipherKey, cipherNonce).decrypt(targetEncrypted)
    } catch {
      throw "source does not decode the target"
    }
    this.target = decoder.decode(targetBytes)
  }

  isMine(): boolean {
    // Generate the public key from the nonce
    const privateKey =
     this.#linkFactory.editorNonceToPrivateKey(this.editorNonce)
    const publicKey  = curve.getPublicKey(privateKey)

    // And make sure they are equal
    return publicKey.every((val, i)=> val == this.publicKey[i])
  }

  async modify(
    {source, target, expiration}:
    {source: string, target?: string, expiration?: bigint|number}
  ) : Promise<CreatedAndExistingLinks> {
    // Perform validation (even though server
    // would do this too)
    if (!this.isMine())
      throw "you cannot modify a link that is not yours"
    if (expiration && expiration < this.expiration)
      throw "expiration cannot decrease"

    return await this.#linkFactory.create(
      source ?? this.source, 
      target ?? this.target,
      expiration ?? this.expiration,
      this.counter + 1n,
      this.editorNonce
    )
  }
}

export type EditorNonceToPrivateKey = (editorNonce: Uint8Array)=> Uint8Array
export interface CreatedAndExistingLinks {
  created: Link,
  existing: Link|null
}

export default class LinkFactory {
  serviceURL: string
  editorNonceToPrivateKey: EditorNonceToPrivateKey

  constructor(serviceURL: string, editorNonceToPrivateKey: EditorNonceToPrivateKey) {
    this.serviceURL = serviceURL
    this.editorNonceToPrivateKey = editorNonceToPrivateKey
  }

  #publicKeyToURL(publicKey: Uint8Array) : string {
    // Encode the public key in base 64
    const publicKeyBase64 =
      btoa(String.fromCodePoint(...publicKey))
      // Make sure it is url safe
      .replace(/\+/g, '-')
      .replace(/\//g, '_')

    return `${this.serviceURL}/${publicKeyBase64}`
  }

  parse(publicKey: Uint8Array, containerSigned: Uint8Array, source: string) : Link {
    return new Link(this, publicKey, containerSigned, source)
  }

  async get(publicKey: Uint8Array, source: string) : Promise<Link> {
    const response = await fetch(this.#publicKeyToURL(publicKey))
    if (response.status != 200) {
      throw await response.text()
    } else {
      return this.parse(
        publicKey,
        new Uint8Array(await response.arrayBuffer()),
        source
      )
    }
  }

  async create(
    source: string,
    target: string,
    expiration: number|bigint,
    counter: number|bigint=0,
    editorNonce: Uint8Array|null=null
  ) : Promise<CreatedAndExistingLinks> {
    // Convert expiration to seconds to big int
    expiration = BigInt(expiration)
    counter = BigInt(counter)

    // Generate editing nonce
    editorNonce = editorNonce ?? randomBytes(24)
    if (editorNonce.length != 24) {
      throw "editor nonce is must be 24 random bytes"
    }

    // Derive editor public and private keys from the salt
    const privateKey = this.editorNonceToPrivateKey(editorNonce)
    const publicKey  = curve.getPublicKey(privateKey)

    // Derive the infohash and proof of knowledge
    const infoHashPrivateKey = sha256(INFO_HASH_PREFIX + source)
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
    const cipherKey = sha256(CIPHER_PREFIX + source)
    const cipherNonce = randomBytes(24)
    const targetEncrypted =
      cipher(cipherKey, cipherNonce).encrypt(
        utf8ToBytes(target)
      )
    // 256 minus two 24-byte nonces
    if (targetEncrypted.length > 208) {
      throw "target is too big"
    }

    // Pack it all together
    const container = concatBytes(
      PUT_VERSION,
      infoHash,
      pok,
      intBytes,
      editorNonce,
      cipherNonce,
      targetEncrypted
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
      const output: CreatedAndExistingLinks = {
        created: this.parse(publicKey, containerSigned, source),
        existing: null
      }

      // Include existing data if it exists
      const oldContainerSigned = new Uint8Array(await response.arrayBuffer())
      if (oldContainerSigned.byteLength) {
        try {
          output.existing = this.parse(publicKey, oldContainerSigned, source)
        } catch {}
      }

      return output
    }
  }
}