# Graffiti Realtime Implementation

Use the Graffiti API for live objects and Blob media, backed by another Graffiti implementation. Trystero handles the WebRTC connections; Graffiti handles signaling and actor identity.

```ts
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";
import { GraffitiRealtime } from "@graffiti-garden/implementation-realtime";

const storage = new GraffitiDecentralized({ writeGracePeriod: 1000 });
const graffiti = new GraffitiRealtime(storage);

// Each iteration of a game's update loop:
const next = await graffiti.post(
  { value: { x, y }, channels: ["game-channel"] },
  session,
);
if (previousUrl) await graffiti.delete(previousUrl, session);
previousUrl = next.url;

// When the host no longer needs live connections:
await graffiti.close();
```

Readers use `discover` and `continueDiscover` with their usual schemas. Repeated continuation receives live updates while storage queries are in flight. The existing Vue discovery helpers can do this polling.

For explicit storage confirmation, such as before sharing a link outside the app:

```ts
const note = await graffiti.post({ value: { text: "Hello" }, channels: ["notes"] }, session);
await graffiti.flush({ urls: [note.url] }, session);
```

| Operation | Behavior |
| --- | --- |
| `post` / `delete` | Accept through the underlying implementation, then send permitted views to connected peers. |
| `get` | Use already discovered live objects or the underlying implementation. Explicit refresh checks the underlying implementation. |
| `discover` / `continueDiscover` | Combine live objects, deletions, and storage results. |
| `postMedia` / `deleteMedia` | Use the underlying implementation's local write queue. |
| `getMedia` | Request Blob data from connected authors, then fall back to storage. |
| `flush({ urls }, session)` | Synchronize selected writes with storage. Omit `urls` to capture all outstanding writes for that session. |
| `close()` | Close this instance's peer connections and signaling. Accepted writes remain with the underlying implementation. |

Decentralized saves pending writes in browser Cache storage. `writeGracePeriod` is in milliseconds, defaults to 1000, and applies to each new write independently. Deleting a write before upload cancels that upload. Failed uploads retain their URL and bytes for retry; `flush` reports failures directly. If persistent browser storage is unavailable, writes wait for storage-service confirmation instead. Local already completes its writes locally, so its `flush` resolves immediately.

This first version uses one direct room per channel and account, retained until logout or `close()`. Live delivery requires a logged-in session and WebRTC; anonymous reads still use storage. TURN, connection pooling across channels, local-history compaction, and audio/video streaming helpers are future work. `postMedia` accepts Blobs, not MediaStreams. Direct peer content is trusted as that authenticated actor's view; content-address verification remains with the persistent implementation.

For tests, use `new GraffitiRealtime(new GraffitiLocal())`.
