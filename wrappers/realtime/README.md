# Graffiti Realtime Wrapper

Use the Graffiti API for live objects and Blob media, backed by another Graffiti implementation. Trystero handles the WebRTC connections; Graffiti handles signaling and actor identity.

```ts
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";
import { GraffitiRealtime } from "@graffiti-garden/realtime";

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

Readers use `discover` and `continueDiscover` with their usual schemas. Repeated activity within one second opens a peer room; a one-off or infrequent read uses storage. Repeated continuation receives live updates while storage queries are in flight. Empty live polls are paced inside the wrapper, so callers can immediately continue, including Vue's `autopoll`.

The [95-line cursor demo](demo/index.html) uses Vue's `<graffiti-discover autopoll>` and `<graffiti-actor-to-handle>` for live positions and usernames. It has no manual discovery loop or peer cache. Run it with the [shared demo server](../../extras/streaming/demo/README.md) from the separate streaming PR. That device demo also uses the Decentralized outbox PR; neither is required to build or test this wrapper over Local.

Live cursors expire after five seconds, or sooner if their reader falls behind the 1,024-entry live window. Catch `GraffitiErrorCursorExpired` and restart discovery. Infrequent storage-only reads keep the underlying implementation's cursor lifetime and caches.

For explicit storage confirmation, such as before sharing a link outside the app:

```ts
const note = await graffiti.post({ value: { text: "Hello" }, channels: ["notes"] }, session);
await graffiti.flush([note.url], session);

// Or confirm several known writes together:
await graffiti.flush([firstUrl, secondUrl], session);
```

| Operation | Behavior |
| --- | --- |
| `post` / `delete` | Accept through the underlying implementation, then send permitted views to connected peers. |
| `get` | Use already discovered live objects or the underlying implementation. Explicit refresh checks the underlying implementation. |
| `discover` / `continueDiscover` | Combine live objects, deletions, and storage results. |
| `postMedia` / `deleteMedia` | Use the underlying implementation's local write queue. |
| `getMedia` | Request Blob data from connected authors, then fall back to storage. |
| `flush(urls, session)` | Synchronize writes for the supplied object or media URLs with storage. |
| `close()` | Close this instance's peer connections and signaling. Accepted writes remain with the underlying implementation. |

Decentralized saves pending writes in browser Cache storage and removes them after upload or cancellation. A separate bounded change log supports continued discovery; older cursors expire normally. `writeGracePeriod` is in milliseconds, defaults to 1000, and starts after acquiring the write lock. Deleting a write before upload cancels that upload. Failed uploads retain their URL and bytes for retry; `flush` reports failures directly. If persistent browser storage is unavailable, writes wait for storage-service confirmation instead. Local already completes its writes locally, so its `flush` resolves immediately.

This first version uses one direct room per active channel and account. Idle rooms close after five seconds. Recent live changes expire after five seconds and are capped at 1,024 entries per account. A slow peer gets at most one send in flight; old live updates are not queued behind it. Storage remains responsible for durable history. Live delivery requires a logged-in session and WebRTC; anonymous reads still use storage. TURN and connection pooling across channels are future work. [Streaming](../../extras/streaming/) provides MoQ audio/video helpers over ordinary Graffiti objects. Direct peer content is trusted as that authenticated actor's view; content-address verification remains with the persistent implementation.

For tests, use `new GraffitiRealtime(new GraffitiLocal())`.
