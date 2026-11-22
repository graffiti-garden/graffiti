import type { Graffiti, GraffitiSession } from "@graffiti-garden/api";
import { Path } from "@moq/net";
import type { Getter } from "@moq/signals";

// Each player/publisher has its own in-memory MoQ origin. This is not a server URL.
export const broadcastName = Path.from("stream.hang");
export const retentionMs = 3000;

/** Stop waiting promptly, removing the listener even when the operation finishes first. */
export function abortable<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function defined<T>(value: Getter<T | undefined>, signal: AbortSignal): Promise<T> {
  while (value.peek() === undefined) await abortable(value.changed(), signal);
  signal.throwIfAborted();
  return value.peek()!;
}

// Base64 keeps frames in ordinary JSON objects. Receivers need no extra request
// for each packet, and object deletion also removes the payload.
export function encode(payload: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < payload.length; start += 32768) {
    binary += String.fromCharCode(...payload.subarray(start, start + 32768));
  }
  return btoa(binary);
}

export function decode(payload: string): Uint8Array {
  return Uint8Array.from(atob(payload), character => character.charCodeAt(0));
}

export async function remove(graffiti: Graffiti, url: string, session: GraffitiSession) {
  try {
    await graffiti.delete(url, session);
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "GraffitiErrorNotFound") throw error;
  }
}
