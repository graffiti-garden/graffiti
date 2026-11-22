import type { Graffiti, GraffitiObjectStream, GraffitiSession } from "@graffiti-garden/api";
import { Group, Origin, Time, type Track } from "@moq/net";
import { Signal } from "@moq/signals";
import { Player } from "@moq/watch";
import { prepareAudio } from "./audio.js";
import { abortable, broadcastName, decode, retentionMs } from "./common.js";
import { frameSchema, trackNames, type Frame, type StreamObject } from "./schema.js";

export interface PlayOptions {
  session?: GraffitiSession;
  signal?: AbortSignal;
  /** Starts muted by default. Call setMuted(false) from a user gesture. */
  muted?: boolean;
}

export interface PlayingStream {
  /** Resolves after stopping; rejects if Graffiti delivery fails. */
  done: Promise<void>;
  stop(): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  /** Timestamps use the sender's media clock, not this device's wall clock. */
  getStats(): { videoFrames: number; audioBytes: number; videoTimestamp?: number; audioTimestamp?: number };
}

/**
 * Receive Graffiti frame objects into a local MoQ origin. MoQ handles decoding,
 * jitter buffering, A/V synchronization, canvas rendering and audio playback.
 * Audio-only streams may omit the canvas.
 */
export async function playStream(
  graffiti: Graffiti,
  object: StreamObject,
  canvas?: HTMLCanvasElement,
  options: PlayOptions = {},
): Promise<PlayingStream> {
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
  signal.throwIfAborted();
  if (object.value.liveStream.audio) await abortable(prepareAudio(), signal);
  signal.throwIfAborted();
  const origin = new Origin.Producer();
  const broadcast = origin.createBroadcast(broadcastName);
  const tracks = trackNames(object).map(name => broadcast.createTrack(name, {
    timescale: Time.Timescale.MICRO,
    // MoQ retains the latest group regardless of maxAge. Superseded codec
    // catalogs do not need to accumulate for the lifetime of the call.
    maxAge: Time.Milli(name === "catalog.json" ? 0 : retentionMs),
  }));
  const receivers = new Map(tracks.map(track => [track.name, new TrackReceiver(track)]));
  broadcast.announce();
  const muted = new Signal(options.muted ?? true);
  const player = new Player({
    // Measured delivery jitter can exceed 80 ms even on a local peer connection.
    // Keep a small fixed buffer: MoQ's automatic rendition delay is much larger.
    origin, name: broadcastName, canvas, muted, volume: 1, visible: "always", delay: Time.Milli(120),
  });

  const done = (async () => {
    const schema = frameSchema(object);
    let iterator: GraffitiObjectStream<typeof schema> | undefined;
    let cursor: string | undefined;
    try {
      while (true) {
        iterator = cursor === undefined
          ? graffiti.discover(object.channels, schema, options.session)
          : graffiti.continueDiscover<typeof schema>(cursor, options.session);
        while (true) {
          let result;
          try {
            result = await abortable(iterator.next(), signal);
          } catch (error) {
            if (!(error instanceof Error) || error.name !== "GraffitiErrorCursorExpired") throw error;
            cursor = undefined;
            break;
          }
          if (result.done) { cursor = result.value.cursor; break; }
          const entry = result.value;
          // A failing storage service need not interrupt live peer delivery.
          if (entry.error) { console.warn("Stream discovery:", entry.error); continue; }
          if (entry.tombstone) continue;
          const frame = entry.object.value.moq;
          if (frame.expires < Date.now() - retentionMs) continue;
          receivers.get(frame.track)?.receive(frame);
        }
        await abortable(new Promise(resolve => setTimeout(resolve, 20)), signal);
      }
    } catch (error) {
      if (!signal.aborted || error !== signal.reason) throw error;
    } finally {
      void iterator?.return({ cursor: "" }).catch(() => {});
      player.close();
      for (const receiver of receivers.values()) receiver.close();
      receivers.clear();
      broadcast.close();
      origin.close();
    }
  })();
  void done.catch(() => {});
  return {
    done,
    async stop() { controller.abort(); await done; },
    async setMuted(value) {
      if (!value) await player.audio.out.context.peek()?.resume();
      muted.set(value);
    },
    getStats: () => ({
      videoFrames: player.video.out.stats.peek()?.frameCount ?? 0,
      audioBytes: player.audio.out.stats.peek()?.bytesReceived ?? 0,
      videoTimestamp: player.renderer.out.timestamp.peek(),
      audioTimestamp: player.audio.out.timestamp.peek(),
    }),
  };
}

/** Reassemble unordered discovery results without holding up other tracks. */
class TrackReceiver {
  private group?: Group.Producer;
  private next = 0;
  private pending = new Map<number, Frame>();

  constructor(private track: Track.Producer) {}

  receive(frame: Frame) {
    if (this.group && frame.group < this.group.sequence) return;
    if (!this.group || frame.group > this.group.sequence) {
      this.group?.close();
      this.group = new Group.Producer(frame.group);
      this.track.writeGroup(this.group);
      this.pending.clear();
      this.next = 0;
    }
    if (frame.frame < this.next) return;
    this.pending.set(frame.frame, frame);
    // Missing frames wait only within this group; a new keyframe starts afresh.
    // Bound memory even if an author advertises frames that never arrive.
    let bytes = 0;
    for (const pending of this.pending.values()) bytes += pending.payload.length;
    if (bytes > 8 * 1024 * 1024) throw new Error("Stream group is too large");
    while (this.pending.has(this.next)) {
      const ready = this.pending.get(this.next)!;
      this.group.writeFrame({ payload: decode(ready.payload), timestamp: Time.Timestamp.fromMicros(ready.timestamp) });
      this.pending.delete(this.next++);
    }
    if (this.track.name !== "video" && this.next) this.group.close();
  }

  close() {
    this.group?.close();
    this.track.close();
  }
}
