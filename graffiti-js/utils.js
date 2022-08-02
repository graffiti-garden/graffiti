export function randomString() {
  return Math.random().toString(36).substr(2)
}

export async function sha256(input) {
  const encoder = new TextEncoder()
  const inputBytes = encoder.encode(input)
  const outputBuffer = await crypto.subtle.digest('SHA-256', inputBytes)
  const outputArray = Array.from(new Uint8Array(outputBuffer))
  return outputArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
