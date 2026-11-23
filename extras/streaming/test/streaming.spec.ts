import { expect, test, vi } from "vitest";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { publishStream, playStream, streamSchema, type PlayingStream, type PublishedStream } from "@graffiti-garden/streaming";

const alice = { actor: "did:example:alice" };
const bob = { actor: "did:example:bob" };
const local = () => new GraffitiLocal({ pouchDBOptions: { name: crypto.randomUUID() }, continueBuffer: 0 });

async function input(video: boolean) {
  const context = new AudioContext();
  await context.resume();
  const oscillator = context.createOscillator();
  const destination = context.createMediaStreamDestination();
  oscillator.connect(destination);
  oscillator.start();
  const stream = destination.stream;
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 90;
  const graphics = canvas.getContext("2d")!;
  let frame = 0;
  const interval = setInterval(() => {
    graphics.fillStyle = `hsl(${frame++ * 15} 70% 50%)`;
    graphics.fillRect(0, 0, canvas.width, canvas.height);
  }, 50);
  if (video) stream.addTrack(canvas.captureStream(20).getVideoTracks()[0]);
  return {
    stream,
    async close() {
      clearInterval(interval);
      stream.getTracks().forEach(track => track.stop());
      await context.close();
    },
  };
}

test("MoQ plays A/V through Local with subsecond latency, late joins, access control and cleanup", async () => {
  const graffiti = local();
  const capture = await input(true);
  const channel = crypto.randomUUID();
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  let published: PublishedStream | undefined;
  let playback: PlayingStream | undefined;
  const releaseMetadata = Promise.withResolvers<void>();
  let delayedUrl: string | undefined;
  let metadataBlocked = false;
  const remove = graffiti.delete.bind(graffiti);
  const deleting = vi.spyOn(graffiti, "delete").mockImplementation(async (...args) => {
    if ((typeof args[0] === "string" ? args[0] : args[0].url) === delayedUrl) {
      metadataBlocked = true;
      await releaseMetadata.promise;
    }
    return remove(...args);
  });
  try {
    published = await publishStream(graffiti, capture.stream, { channels: [channel], allowed: [bob.actor] }, alice);
    delayedUrl = published.object.url;
    // Join after the original media groups have expired. The current catalog
    // and a recent keyframe must still be enough to start playback.
    await new Promise(resolve => setTimeout(resolve, 4500));
    const descriptors = [];
    for await (const result of graffiti.discover([channel], streamSchema, bob)) {
      if (!result.error && !result.tombstone) descriptors.push(result.object);
    }
    expect(descriptors.map(object => object.url)).toEqual([published.object.url]);
    const outsider = [];
    for await (const entry of graffiti.discover([channel], {}, { actor: "did:example:outsider" })) {
      if (!entry.error && !entry.tombstone) outsider.push(entry.object);
    }
    expect(outsider).toEqual([]);

    playback = await playStream(graffiti, descriptors[0], canvas, { session: bob, muted: false });
    await Promise.race([
      vi.waitFor(() => {
        expect(playback!.getStats().videoFrames).toBeGreaterThan(15);
        expect(playback!.getStats().audioBytes).toBeGreaterThan(1000);
        expect(playback!.getStats().audioTimestamp).toBeGreaterThan(0);
        expect(canvas.width).toBe(160);
      }, { timeout: 10_000 }),
      published.done.then(() => { throw new Error("Publisher stopped unexpectedly"); }),
      playback.done.then(() => { throw new Error("Player stopped unexpectedly"); }),
    ]);
    const latencies = [];
    for (let sample = 0; sample < 15; sample++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      // The synthetic sender and receiver share performance.now() in this test.
      latencies.push(performance.now() - playback.getStats().videoTimestamp!);
    }
    latencies.sort((a, b) => a - b);
    console.log("Local capture-to-render latency (ms)", { median: latencies[7], p95: latencies[14] });
    expect(latencies[7]).toBeLessThan(400);
    expect(latencies[14]).toBeLessThan(1000);
    // Renewal changes only the announcement URL, never the running broadcast.
    const first = descriptors[0];
    await vi.waitFor(() => expect(published!.object.url).not.toBe(first.url), { timeout: 15_000 });
    expect(published.object.value.liveStream.id).toBe(first.value.liveStream.id);
    expect(published.object.value.liveStream.expires).toBeGreaterThan(first.value.liveStream.expires);
    await vi.waitFor(() => expect(metadataBlocked).toBe(true), { timeout: 3000 });
    // Deleting persisted metadata can wait on a network. Frames must still
    // disappear on time while that independent deletion is blocked.
    await new Promise(resolve => setTimeout(resolve, 4500));
    const expired = [];
    for await (const entry of graffiti.discover([channel], {
      properties: { value: { properties: { moq: { properties: {
        expires: { maximum: Date.now() - 1500 },
      }, required: ["expires"] } }, required: ["moq"] } },
    }, bob)) {
      if (entry.error) throw entry.error;
      if (!entry.tombstone) expired.push(entry.object.url);
    }
    expect(expired).toEqual([]);
    releaseMetadata.resolve();
    await vi.waitFor(async () => {
      await expect(graffiti.get(first.url, {}, alice)).rejects.toMatchObject({ name: "GraffitiErrorNotFound" });
    }, { timeout: 3000 });
    const frames = playback.getStats().videoFrames;
    await vi.waitFor(() => expect(playback!.getStats().videoFrames).toBeGreaterThan(frames + 5));
    await playback.stop();
    playback = undefined;
    await published.stop();
    expect(capture.stream.getTracks().every(track => track.readyState === "live")).toBe(true);
    const remaining = [];
    for await (const entry of graffiti.discover([channel], {}, alice)) {
      if (!entry.error && !entry.tombstone) remaining.push(entry.object);
    }
    expect(remaining).toEqual([]);
  } finally {
    releaseMetadata.resolve();
    await playback?.stop();
    await published?.stop();
    await capture.close();
    canvas.remove();
    deleting.mockRestore();
  }
});

test("audio-only streams use the bundled Opus polyfill when native audio codecs are absent", async () => {
  const graffiti = local();
  const capture = await input(false);
  const controller = new AbortController();
  let published: PublishedStream | undefined;
  let playback: PlayingStream | undefined;
  // Exercise the same asset loading path needed by older iOS Safari.
  vi.stubGlobal("AudioEncoder", undefined);
  vi.stubGlobal("AudioDecoder", undefined);
  vi.stubGlobal("AudioData", undefined);
  vi.stubGlobal("EncodedAudioChunk", undefined);
  try {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
    try {
      await expect(publishStream(graffiti, capture.stream, { channels: [crypto.randomUUID()] }, alice))
        .rejects.toThrow("Loading the Opus worker failed");
    } finally { fetch.mockRestore(); }
    // A transient asset failure must not poison all later sharing attempts.
    published = await publishStream(graffiti, capture.stream, { channels: [crypto.randomUUID()], signal: controller.signal }, alice);
    playback = await playStream(graffiti, published.object, undefined, { muted: false });
    await Promise.race([
      vi.waitFor(() => {
        expect(playback!.getStats().audioBytes).toBeGreaterThan(1000);
        expect(playback!.getStats().audioTimestamp).toBeGreaterThan(0);
        expect(performance.now() - playback!.getStats().audioTimestamp!).toBeLessThan(400);
      }, { timeout: 10_000 }),
      published.done.then(() => { throw new Error("Publisher stopped unexpectedly"); }),
    ]);
    await playback.setMuted(true);
    await playback.setMuted(false);
    controller.abort();
    await published.done;
    expect(capture.stream.getAudioTracks()[0].readyState).toBe("live");
  } finally {
    await playback?.stop();
    await published?.stop();
    await capture.close();
    vi.unstubAllGlobals();
  }
});

test("blocked frame cleanup stops publication instead of accumulating work indefinitely", async () => {
  const graffiti = local();
  const capture = await input(false);
  const release = Promise.withResolvers<void>();
  const remove = graffiti.delete.bind(graffiti);
  let posted = 0;
  const post = graffiti.post.bind(graffiti);
  vi.spyOn(graffiti, "post").mockImplementation(async (...args) => {
    posted++;
    return post(...args);
  });
  vi.spyOn(graffiti, "delete").mockImplementation(async (...args) => {
    await release.promise;
    return remove(...args);
  });
  const published = await publishStream(graffiti, capture.stream, { channels: [crypto.randomUUID()] }, alice);
  try {
    await vi.waitFor(() => expect(posted).toBeGreaterThan(1024), { timeout: 30_000 });
    const stoppedAt = posted;
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(posted).toBe(stoppedAt);
    release.resolve();
    await expect(published.done).rejects.toThrow("Stream cleanup is falling behind");
  } finally {
    release.resolve();
    await published.stop().catch(() => {});
    await capture.close();
  }
});

test("cancelling startup leaves no objects and keeps the caller's tracks", async () => {
  const graffiti = local();
  const capture = await input(false);
  const controller = new AbortController();
  const channel = crypto.randomUUID();
  try {
    const starting = publishStream(graffiti, capture.stream, { channels: [channel], signal: controller.signal }, alice);
    controller.abort();
    await expect(starting).rejects.toMatchObject({ name: "AbortError" });
    expect(capture.stream.getAudioTracks()[0].readyState).toBe("live");
    const remaining = [];
    for await (const entry of graffiti.discover([channel], {}, alice)) {
      if (!entry.error && !entry.tombstone) remaining.push(entry.object);
    }
    expect(remaining).toEqual([]);
  } finally {
    await capture.close();
  }
});

test("a publishing AbortError is reported as a failure and cleans up the stream", async () => {
  const graffiti = local();
  const capture = await input(false);
  const original = graffiti.post.bind(graffiti);
  const failure = new DOMException("Storage unavailable", "AbortError");
  vi.spyOn(graffiti, "post").mockImplementation((object, session) => {
    if ("moq" in object.value) return Promise.reject(failure);
    return original(object, session);
  });
  let published: PublishedStream | undefined;
  try {
    published = await publishStream(graffiti, capture.stream, { channels: [crypto.randomUUID()] }, alice);
    await expect(published.done).rejects.toBe(failure);
    await expect(graffiti.get(published.object.url, {}, alice)).rejects.toMatchObject({ name: "GraffitiErrorNotFound" });
  } finally {
    await published?.stop().catch(() => {});
    await capture.close();
  }
});

test("a slow write skips expired video groups and resumes at live frames", async () => {
  const graffiti = local();
  const capture = await input(true);
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  const post = graffiti.post.bind(graffiti);
  let delayed = false;
  vi.spyOn(graffiti, "post").mockImplementation(async (object, session) => {
    const frame = "moq" in object.value ? object.value.moq : undefined;
    if (!delayed && frame && typeof frame === "object" && "track" in frame && frame.track === "video") {
      delayed = true;
      // Hold a real Graffiti write past MoQ's three-second retention window.
      // This reproduces an outbox/storage stall, without mocking MoQ itself.
      await new Promise(resolve => setTimeout(resolve, 4000));
    }
    return post(object, session);
  });
  let published: PublishedStream | undefined;
  let playback: PlayingStream | undefined;
  try {
    published = await publishStream(graffiti, capture.stream, { channels: [crypto.randomUUID()] }, alice);
    playback = await playStream(graffiti, published.object, canvas);
    await Promise.race([
      vi.waitFor(() => {
        expect(delayed).toBe(true);
        expect(playback!.getStats().videoFrames).toBeGreaterThan(15);
        expect(performance.now() - playback!.getStats().videoTimestamp!).toBeLessThan(400);
      }, { timeout: 10_000 }),
      published.done.then(() => { throw new Error("Publisher stopped instead of skipping an expired group"); }),
      playback.done.then(() => { throw new Error("Playback stopped unexpectedly"); }),
    ]);
  } finally {
    await playback?.stop();
    await published?.stop().catch(() => {});
    await capture.close();
    canvas.remove();
  }
});
