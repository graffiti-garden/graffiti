# Graffiti Streaming

Publish and play live audio/video using ordinary Graffiti objects. [MoQ](https://moq.dev/) handles capture, codecs, and synchronized playback; Graffiti carries its frames. Works with any Graffiti implementation, including Local.

```ts
import {
  publishStream,
  playStream,
  streamSchema,
} from "@graffiti-garden/streaming";

// Start sharing. The application owns permissions and the input tracks.
const input = await navigator.mediaDevices.getUserMedia({
  audio: true,
  video: { width: 640, height: 360, frameRate: 15 },
});
const broadcast = await publishStream(
  graffiti,
  input,
  { channels: ["my-call"] },
  session,
);
broadcast.done.catch(showError);

// On another device: play the first live stream found with normal discovery.
for await (const result of graffiti.discover(["my-call"], streamSchema, session)) {
  if (result.error || result.tombstone) continue;
  if (result.object.value.liveStream.expires <= Date.now()) continue;
  const player = await playStream(graffiti, result.object, canvasElement, { session });
  player.done.catch(showError);
  soundButton.onclick = () => player.setMuted(false).catch(showError);
  // Call player.stop() when the stream disappears or the viewer leaves.
  break;
}

// Stop sharing and remove the descriptor and live frames.
await broadcast.stop();
input.getTracks().forEach(track => track.stop());
```

For a participant list, use `continueDiscover` too. Keep one player per
`(actor, liveStream.id)`, update its announcement on renewal, and stop it at the
latest expiry if no renewal arrives. An older announcement's tombstone must not
remove a newer one. The [demo](demo/app.js) implements that lifecycle.

| API | Behavior |
| --- | --- |
| `publishStream(graffiti, input, { channels, allowed?, signal? }, session)` | Starts encoding; resolves with `{ object, done, stop }` once its descriptor is posted. Uses the first audio track and first video track, whichever are present. |
| `streamSchema` | Finds stream announcements through `discover` / `continueDiscover`. Group them by actor and `value.liveStream.id`; ignore expired announcements and remove participants at `value.liveStream.expires`. Renewals change the URL, not the broadcast ID. |
| `playStream(graffiti, object, canvas?, { session?, signal?, muted? }?)` | Receives frames and plays video on the canvas and audio through Web Audio. Starts muted. Omit the canvas for audio-only playback. |
| `player.setMuted(muted)` | Enables/disables audio. Unmute from a user gesture. |
| `player.getStats()` | Decoded video-frame count, audio bytes, and playback timestamps on the sender's media clock. Useful for detecting progress; timestamps are not comparable between devices. |
| `done` | Resolves after stopping, or rejects if Graffiti delivery/publication fails. MoQ currently logs some codec failures to the browser console. |
| `stop()` | Stops this helper and awaits cleanup. Publishers leave the caller's input tracks running. |

Frames travel immediately, with no MP4 segments to fill. Playback uses a 120 ms jitter buffer, H.264 video capped at 600 kbps, and 32 kbps Opus audio in 20 ms frames. Actual latency also depends on capture, encoding, Graffiti delivery, and the network. Video keyframes arrive every half second so late viewers and slow receivers can resume without replaying the whole stream.

Each frame is a JSON object containing its broadcast ID, track, group, frame index, timestamp, expiry, and base64 payload. Base64 adds about 33% to the encoded bytes, but avoids a separate media-fetch round trip per frame. Discovery filters by the announcement's actor. Publishers retain three seconds of frames and the latest codec catalog, then delete them. Announcements expire after 30 seconds and renew every 10 seconds after flushing; flush makes them visible without waiting for the underlying write grace period. This also lets viewers discard abandoned streams after a tab closes without cleanup. Expiry is interpreted by viewers; it does not delete stored objects on an absent publisher's behalf. This first version has no adaptive bitrate, recording archive, or separate MoQ relay.

For peer delivery, pass `new GraffitiRealtime(new GraffitiDecentralized({ writeGracePeriod: 5000 }))`. Frames deleted on time can avoid persistent upload. With Local or another implementation, the helpers use its normal storage. The package has no dependency on the realtime wrapper.

Requires browser H.264 WebCodecs support and AudioWorklet. MoQ's Opus polyfill covers browsers without native audio WebCodecs. When serving the browser build, keep its adjacent `.mjs` worker and `.wasm` assets; when rebundling, copy those assets beside your output bundle. Cross-origin hosting must allow CORS. No cross-origin isolation is required.

Publication stops if cleanup falls behind by 1,024 objects, rather than accumulating work for the rest of the call. Stopping closes encoders promptly and waits for in-flight Graffiti writes and deletions; it cannot cancel an underlying storage request.

Run `npm test --workspace @graffiti-garden/streaming` for synthetic audio/video tests over Local. The separate `test:performance` script runs two browser pages against the real decentralized test server, checks peer delivery and audio continuity, and verifies that media avoids persistent upload. Build the Decentralized and realtime browser packages first. See [the performance notebook](test/performance/NOTES.md) for commands, measurements, and limitations.

Run `npm run demo --workspace @graffiti-garden/streaming` for the two-device demo; see [demo/README.md](demo/README.md).
