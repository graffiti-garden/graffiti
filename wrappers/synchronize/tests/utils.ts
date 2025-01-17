import { assert } from "vitest";
import type { GraffitiPutObject, GraffitiStream } from "../src";

export function randomString(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function randomValue() {
  return {
    [randomString()]: randomString(),
  };
}

export function randomPutObject(): GraffitiPutObject<{}> {
  return {
    value: randomValue(),
    channels: [randomString(), randomString()],
  };
}

export async function nextStreamValue<S, T>(iterator: GraffitiStream<S, T>) {
  const result = await iterator.next();
  assert(!result.done && !result.value.error, "result has no value");
  return result.value.value;
}
