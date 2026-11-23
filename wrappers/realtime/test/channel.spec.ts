import { expect, test, vi } from "vitest";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiErrorCursorExpired } from "@graffiti-garden/api";
import { Channel, type Change } from "../src/channel.js";

test("real Trystero peers exchange unpublished objects and deletions", async () => {
  const options = { pouchDBOptions: { name: `realtime-test-${crypto.randomUUID()}` }, continueBuffer: 0 };
  const graffiti = new GraffitiLocal(options);
  const alice = { actor: "did:example:alice" };
  const bob = { actor: "did:example:bob" };
  const received: Change[] = [];
  const errors: unknown[] = [];
  const channel = crypto.randomUUID();
  const change: Change = { object: {
    url: "test:unpublished", actor: alice.actor, channels: [channel],
    allowed: [bob.actor], value: { x: 10, y: 20 },
  } };
  const get = graffiti.get.bind(graffiti);
  const failure = new GraffitiErrorCursorExpired("Cache out of sync");
  let failed = false;
  vi.spyOn(graffiti, "get").mockImplementation(async (...args) => {
    if (!failed && args[2] && "actor" in args[2] && args[2].actor === bob.actor) {
      failed = true;
      throw failure;
    }
    return get(...args);
  });
  const author = new Channel(graffiti, channel, alice, () => {}, error => errors.push(error), () => [change]);
  const reader = new Channel(graffiti, channel, bob, change => received.push(change), error => errors.push(error), () => []);
  try {
    // The one-time snapshot must survive asymmetric authentication, including
    // a transient binding lookup failure. No application resend is allowed.
    await vi.waitFor(() => expect(received).toContainEqual(change), { timeout: 30_000 });
    await expect(graffiti.get(change.object.url, {}, bob)).rejects.toMatchObject({ name: "GraffitiErrorNotFound" });
    author.send({ ...change, tombstone: true });
    await vi.waitFor(() => expect(received).toContainEqual({ ...change, tombstone: true }));

    expect(errors).toEqual([failure]);
  } finally {
    await Promise.all([author.close(), reader.close()]);
    // The test browser's temporary profile owns and discards this local database.
  }
});
