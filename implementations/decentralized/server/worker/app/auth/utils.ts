export function encodeBase64(bytes: Uint8Array): string {
  // Convert it to base64
  const base64 = btoa(String.fromCodePoint(...bytes));
  // Make sure it is url safe
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/\=+$/, "");
}

export function decodeBase64(base64Url: string): Uint8Array<ArrayBuffer> {
  // Undo url-safe base64
  let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding if necessary
  while (base64.length % 4 !== 0) base64 += "=";
  // Decode
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export function randomBytes(
  numberOfBytes: number = 32,
): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(numberOfBytes);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function randomBase64(numberOfBytes: number = 32): string {
  return encodeBase64(randomBytes(numberOfBytes));
}
