export function uint8ToHex(uint8) {
  return Array.from(uint8)
    .map(b=> b.toString(16).padStart(2, "0"))
    .join('')
}

export function hexToUint8(hex) {
  return Uint8Array.from(
    hex.match(/.{1,2}/g).map(b=> parseInt(b, 16)))
}

export async function sha256Uint8(message) {
  const msgUint8 = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8)
  return new Uint8Array(hashBuffer)
}

export async function sha256Hex(message) {
  return uint8ToHex(await sha256Uint8(message))
}

export async function randomHash() {
  return await sha256Hex(crypto.randomUUID())
}