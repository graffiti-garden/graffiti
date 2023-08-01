import * as jose from 'jose'

export const encoder = new TextEncoder()
export const decoder = new TextDecoder()

export async function sha256Uint8(message) {
  const msgUint8 = encoder.encode(message)
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8)
  return new Uint8Array(hashBuffer)
}

export function uint8ToHex(uint8) {
  return Array.from(uint8)
    .map(b=> b.toString(16).padStart(2, "0"))
    .join('')
}

export async function sha256Hex(message) {
  return uint8ToHex(await sha256Uint8(message))
}

export async function randomHash() {
  return await sha256Hex(crypto.randomUUID())
}

export async function encrypt(value, password) {
  return new jose.CompactEncrypt(encoder.encode(value))
      .setProtectedHeader({
        alg: 'dir',
        enc: 'A128CBC-HS256',
      }).encrypt(await sha256Uint8('key:'+password))
}

export async function decrypt(encrypted, password) {
  const { plaintext } =
    await jose.compactDecrypt(encrypted, await sha256Uint8('key:'+password))
  return decoder.decode(plaintext)
}