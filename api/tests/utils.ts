import { assert } from "vitest";
import type {
  GraffitiPutObject,
  GraffitiObjectStream,
  JSONSchema,
  GraffitiObject,
} from "@graffiti-garden/api";

export function randomString(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  const str = Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // check for unicode support
  return str + "👩🏽‍❤️‍💋‍👩🏻🫱🏼‍🫲🏿";
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

export async function nextStreamValue<Schema extends JSONSchema>(
  iterator: GraffitiObjectStream<Schema>,
): Promise<GraffitiObject<Schema>> {
  const result = await iterator.next();
  assert(!result.done && !result.value.error, "result has no value");
  assert(!result.value.tombstone, "result has been deleted!");
  return result.value.object;
}
