import type { Graffiti, GraffitiSession } from "@graffiti-garden/api";
import { Origin, Time } from "@moq/net";
import * as Publish from "@moq/publish";
import { Effect } from "@moq/signals";
import { prepareAudio } from "./audio.js";
import { abortable, broadcastName, defined, encode, remove, retentionMs } from "./common.js";
import { type StreamObject, streamSchema, trackNames } from "./schema.js";

export interface PublishOptions {
  channels: string[];
  allowed?: string[];
  signal?: AbortSignal;
}

export interface PublishedStream {
  /** Latest announcement. Its URL changes on renewal; liveStream.id stays fixed. */
  object: StreamObject;
  /** Resolves after stopping and cleanup; rejects if publication fails. */
  done: Promise<void>;
  stop(): Promise<void>;
}

/**
 * Publish live audio/video through ordinary Graffiti objects. MoQ owns capture,
 * codecs and framing; each encoded frame is posted as soon as it is available.
 * The caller owns the input MediaStream and remains responsible for stopping it.
 */
export async function publishStream(
  graffiti: Graffiti,
  stream: MediaStream,
  options: PublishOptions,
  session: GraffitiSession,
): Promise<PublishedStream> {
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
  signal.throwIfAborted();
  const videoTrack = stream.getVideoTracks()[0];
  const audioTrack = stream.getAudioTracks()[0];
  if (!videoTrack && !audioTrack) throw new TypeError("The stream has no audio or video tracks");

  const resources: { close(): void }[] = [];
  const close = () => { while (resources.length) resources.pop()!.close(); };
  const owned = new Map<string, number>();
  let object: StreamObject;
  let broadcast: Publish.Broadcast;
  try {
    const origin = new Origin.Producer();
    resources.push(origin);
    const video = videoTrack && new Publish.Video.Capture({ source: videoTrack as Publish.Video.StreamTrack });
    if (video) resources.push(video);
    // Start the capture context while still handling the application's gesture.
    const audio = audioTrack && new Publish.Audio.Capture({ source: audioTrack as Publish.Audio.StreamTrack, channelCount: 1 });
    if (audio) {
      resources.push(audio);
      await abortable(prepareAudio(), signal);
    }
    broadcast = new Publish.Broadcast({
      origin, name: broadcastName, display: video?.out.display, maxAge: Time.Milli(retentionMs), announce: false,
    });
    resources.push(broadcast);
    // Broadcast's default catalogs retain every revision. Serve just the latest
    // through its public catalog API; Graffiti handles the announcement itself.
    const net = await defined(broadcast.net, signal);
    const catalog = new Effect();
    resources.push(catalog);
    broadcast.catalog.serve(net.createTrack("catalog.json", { maxAge: Time.Milli(0) }), catalog);
    if (video) resources.push(new Publish.Video.Encoder("video", {
      broadcast, capture: video,
      config: { codec: "avc1.42", maxBitrate: 600_000, keyframeInterval: Time.Milli(500) },
    }));
    if (audio) resources.push(new Publish.Audio.Encoder("audio", {
      broadcast, capture: audio, codec: { mime: "opus", bitrate: 32_000, frameDuration: Time.Milli(20) },
    }));
    object = await graffiti.post<typeof streamSchema>({
      value: { liveStream: { format: "moq-hang/1", id: crypto.randomUUID(), audio: !!audio, video: !!video, expires: Date.now() + 30_000 } },
      channels: options.channels,
      allowed: options.allowed,
    }, session);
    owned.set(object.url, Infinity);
    signal.throwIfAborted();
  } catch (error) {
    close();
    await Promise.all([...owned.keys()].map(url => remove(graffiti, url, session)));
    throw error;
  }
  // Stop capture/encoding promptly even if an accepted Graffiti write is still
  // finishing. The tasks below still account for that write before cleanup.
  signal.addEventListener("abort", close, { once: true });

  async function forward(name: string) {
    const net = await defined(broadcast.net, signal);
    // Durable writes occasionally stall for 100–200 ms. Preserve those packets
    // so playback can catch up, while bounding stale media after a longer stall.
    // This is a queue limit, not a delay added to every frame.
    const subscription = net.track(name).subscribe({ maxAge: Time.Milli(250) }).ordered();
    let previousCatalog: string | undefined;
    try {
      while (true) {
        const frame = await abortable(subscription.readFrame(), signal);
        if (!frame) throw new Error(`The ${name} encoder ended`);
        const expires = name === "catalog.json" ? Number.MAX_SAFE_INTEGER : Date.now() + retentionMs;
        const posted = await graffiti.post({
          value: { moq: {
            stream: object.value.liveStream.id, track: name, group: frame.group, frame: frame.frame,
            timestamp: frame.timestamp.asMicros(), payload: encode(frame.payload), expires,
          } },
          channels: options.channels,
          allowed: options.allowed,
        }, session);
        owned.set(posted.url, expires);
        // An unavailable deletion path must not grow a call-length work queue.
        if (owned.size > 1024) throw new Error("Stream cleanup is falling behind");
        if (name === "catalog.json") {
          // Keep the latest codec configuration for viewers who join later.
          if (previousCatalog) owned.set(previousCatalog, 0);
          previousCatalog = posted.url;
        }
      }
    } finally {
      subscription.close();
    }
  }

  async function collect(kind: "frames" | "metadata") {
    while (true) {
      await abortable(new Promise(resolve => setTimeout(resolve, 1000)), signal);
      for (const [url, expires] of owned) {
        // Replaced catalogs/announcements use 0; live frames have a deadline.
        if (expires > Date.now() || (expires === 0) !== (kind === "metadata")) continue;
        signal.throwIfAborted();
        await remove(graffiti, url, session);
        owned.delete(url);
      }
    }
  }

  async function announce() {
    let previous: string | undefined;
    while (true) {
      // Announcements must survive the underlying write grace period. Frames
      // continue independently while this small presence record is flushed.
      await graffiti.flush([object.url], session);
      if (previous) owned.set(previous, 0);
      await abortable(new Promise(resolve => setTimeout(resolve, 10_000)), signal);
      const next = await graffiti.post<typeof streamSchema>({
        value: { liveStream: { ...object.value.liveStream, expires: Date.now() + 30_000 } },
        channels: options.channels, allowed: options.allowed,
      }, session);
      owned.set(next.url, Infinity);
      previous = object.url;
      object = next;
    }
  }

  // Stop every task before deleting their publications, including any post that
  // was already in flight. A source AbortError is still a failure, not a stop().
  let failure: unknown;
  // Deleting persisted metadata may need a network read. Its separate collector
  // cannot hold up local frame cancellation, even when that network is offline.
  const tasks = [...trackNames(object).map(forward), collect("frames"), collect("metadata"), announce()].map(task => task.catch(error => {
    if (!signal.aborted) {
      failure = error;
      controller.abort();
    }
  }));
  const done = (async () => {
    await Promise.all(tasks);
    signal.removeEventListener("abort", close);
    close();
    await Promise.all([...owned.keys()].map(url => remove(graffiti, url, session)));
    owned.clear();
    if (failure) throw failure;
  })();
  void done.catch(() => {});
  return { get object() { return object; }, done, async stop() { controller.abort(); await done; } };
}
