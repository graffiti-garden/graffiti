import { GraffitiErrorNotFound } from "@graffiti-garden/api";

export function encodeBase64(bytes: Uint8Array): string {
  // Convert it to base64
  const base64 = btoa(String.fromCodePoint(...bytes));
  // Make sure it is url safe
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/\=+$/, "");
}

export function decodeBase64(base64Url: string): Uint8Array {
  // Undo url-safe base64
  let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding if necessary
  while (base64.length % 4 !== 0) base64 += "=";
  // Decode
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export function randomBase64(numBytes: number = 32): string {
  // Generate random bytes
  const bytes = new Uint8Array(numBytes);
  crypto.getRandomValues(bytes);
  return encodeBase64(bytes);
}

const OBJECT_URL_PREFIX = "graffiti:";

export function encodeObjectUrlComponent(value: string) {
  const replaced = value.replace(/:/g, "!").replace(/\//g, "~");
  return encodeURIComponent(replaced);
}
export function decodeObjectUrlComponent(value: string) {
  const decoded = decodeURIComponent(value);
  return decoded.replace(/!/g, ":").replace(/~/g, "/");
}
export function encodeGraffitiUrl(actor: string, id: string, prefix: string) {
  return `${prefix}${encodeObjectUrlComponent(actor)}:${encodeObjectUrlComponent(id)}`;
}
export function encodeObjectUrl(actor: string, id: string) {
  return encodeGraffitiUrl(actor, id, OBJECT_URL_PREFIX);
}

export function decodeGraffitiUrl(url: string, prefix: string) {
  if (!url.startsWith(prefix)) {
    throw new GraffitiErrorNotFound(`URL does not start with ${prefix}`);
  }
  const slices = url.slice(prefix.length).split(":");
  if (slices.length !== 2) {
    throw new GraffitiErrorNotFound("URL has too many colon-seperated parts");
  }
  const [actor, id] = slices.map(decodeObjectUrlComponent);
  return { actor, id };
}
export function decodeObjectUrl(url: string) {
  return decodeGraffitiUrl(url, OBJECT_URL_PREFIX);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        if (typeof r.result === "string") {
          resolve(r.result);
        } else {
          reject(new Error("Unexpected result type"));
        }
      };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  if (typeof Buffer !== "undefined") {
    const ab = await blob.arrayBuffer();
    return `data:${blob.type};base64,${Buffer.from(ab).toString("base64")}`;
  }

  throw new Error("Unsupported environment");
}

export async function base64ToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return await response.blob();
}
