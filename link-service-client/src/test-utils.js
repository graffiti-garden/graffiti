import { sha256 } from '@noble/hashes/sha256'
import { concatBytes, randomBytes, utf8ToBytes, bytesToHex } from '@noble/hashes/utils'

export function randomString(length=64) {
  return bytesToHex(randomBytes(length/2))
}

export function soon() {
  return Math.ceil(Date.now()/1000) + 100
}

export function mockNonceToPrivateKey(secret) {
  secret = secret ?? randomString()
  return nonce=> sha256(concatBytes(nonce, utf8ToBytes(secret)))
}