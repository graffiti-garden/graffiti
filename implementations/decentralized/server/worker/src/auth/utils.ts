import { encodeBase64Url } from "hono/utils/encode";

export function randomBytes(numberOfBytes: number = 32): ArrayBuffer {
  const bytes = new Uint8Array(numberOfBytes);
  crypto.getRandomValues(bytes);
  return bytes.buffer;
}

export function randomBase64(numberOfBytes: number = 32): string {
  return encodeBase64Url(randomBytes(numberOfBytes));
}
