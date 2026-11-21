import { expect, test, vi } from "vitest";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { Channel, type Change } from "../src/channel.js";

test("real Trystero peers exchange unpublished objects, deletions, and Blob data", async () => {
  const options = { pouchDBOptions: { name: `realtime-test-${crypto.randomUUID()}` }, continueBuffer: 0 };
  const graffiti = new GraffitiLocal(options);
  const alice = { actor: "did:example:alice" };
  const bob = { actor: "did:example:bob" };
  const received: Change[] = [];
  const errors: unknown[] = [];
  const channel = crypto.randomUUID();
  const author = new Channel(graffiti, channel, alice, () => {}, error => errors.push(error));
  const reader = new Channel(graffiti, channel, bob, change => received.push(change), error => errors.push(error));
  const change: Change = { object: {
    url: "test:unpublished", actor: alice.actor, channels: [channel],
    allowed: [bob.actor], value: { x: 10, y: 20 },
  } };
  try {
    // Retry only until signaling and actor verification have completed.
    await vi.waitFor(() => {
      author.send(change);
      expect(received).toContainEqual(change);
    }, { timeout: 30_000, interval: 100 });
    await expect(graffiti.get(change.object.url, {}, bob)).rejects.toMatchObject({ name: "GraffitiErrorNotFound" });
    author.send({ ...change, tombstone: true });
    await vi.waitFor(() => expect(received).toContainEqual({ ...change, tombstone: true }));

    const url = await graffiti.postMedia({ data: new Blob(["hello"], { type: "text/plain" }), allowed: [bob.actor] }, alice);
    const media = await reader.getMedia(url, { types: ["text/plain"] }, false);
    expect(media?.actor).toBe(alice.actor);
    expect(await media?.data.text()).toBe("hello");
    expect(media?.allowed).toEqual([bob.actor]);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([author.close(), reader.close()]);
    // The test browser's temporary profile owns and discards this local database.
  }
});
