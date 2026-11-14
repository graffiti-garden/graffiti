# Proposal: replay cache before network finishes, retaining errors

Status: deferred for a separate review. No new Graffiti API option is proposed.

## Behavior

For discovery, start the normal refresh and emit already verified cached results
without waiting for it. Then merge network results and authoritative tombstones
into the same stream. Keep existing error behavior: origin/object failures remain
error entries; fatal schema/cursor failures still reject the stream. A network
failure must not look like a successful refresh or a deletion.

Apps can render cached objects and show an error, or discard results when they see
an error. Without changing the API, they cannot identify each object's freshness,
know when a cache-only phase ends, or request atomic all-or-nothing results. Those
are explicit limits of this approach.

This proposal concerns streaming discovery. A getter returns one promise, so it
cannot both resolve cached data and later reject with a refresh error. Keep its
existing `refresh` semantics until a separate design is justified. Offline posting
and durable write retries are also separate work.

## Minimum internal changes

1. Read a query's cached message IDs and protocol-verified originals in the current
   reader scope. Reapply the original schema, channel filter, masking, record kind,
   and known-deletion state. Raw inbox bytes alone are not trusted cached results.
2. Yield those results while the usual network operation runs. Attach rejection
   handling immediately and cancel pending work when the consumer closes.
3. Deduplicate the normal refresh against the initial replay, but allow a later
   tombstone or newly verified location to change the visible result. Preserve
   generation checks so late work cannot restore a known missing location.
4. Advance checkpoints only for completed network work and handled validation.
   Cached replay alone never proves the inbox was refreshed. Transient failures
   retain the previous position for a later poll.

The current validation queue fills up to 128 entries before yielding. Simply
moving raw-cache replay earlier would still block a small cached result set while
waiting for the next network page. The verified-cache phase must be independently
consumable, or the queue must yield ready results without first filling itself.
Keep the existing concurrency and IndexedDB batching optimizations.

## Tradeoffs and errors

- **Staleness:** cached objects may briefly reappear before a verified deletion
  arrives. This is useful offline, but unsuitable for treating a cached result as
  confirmation of current availability. Server index expiry alone removes nothing.
- **Privacy:** reuse only the current actor's verified entries; never replay
  another session's private data. Logging out does not make browser storage a secure
  erasure mechanism; this proposal must not broaden existing access.
- **Latency:** a browser may reject offline fetches quickly, but that is not
  guaranteed. Inbox requests and small storage validations have deadlines; DID
  resolution and media reads have their own policies. Do not use `navigator.onLine`
  as proof that a particular service is reachable.
- **Failure backoff:** the inbox currently waits five seconds before reporting an
  initial fetch failure. Removing that alone can make automatic polling spin:
  discovery yields the error and returns a cursor, and Vue treats that as a
  completed poll. Move backoff to subsequent attempts as part of this work, with
  a test that repeated offline polls do not form a tight loop.
- **Error display:** Vue currently logs yielded discovery errors while its `error`
  ref handles thrown errors. A separate small Vue change should expose yielded
  failures through that existing ref if apps are to display them. No public
  Graffiti API change is needed. Preserve valid objects and partial progress.
- **Cancellation:** delivering cached results can cause callers to close before
  the refresh finishes. Preserve cancellation and personal pin handling; do not
  leave detached refresh failures or mark unfinished work complete.

Upstream `{ refresh: false }` already reuses a completed cached query, but a cache
miss still requires the network. It is not a cache-only contract, and this proposal
does not add one. Default discovery remains network-first until this work is reviewed.

## Acceptance cases

Use implementation tests for the cache/network timing and keep API tests minimal:

- Verified cached results arrive while the network is deliberately stalled, with
  both fewer and more than 128 results.
- A later offline error is observable without removing those cached objects or
  advancing the checkpoint; automatic polling remains bounded.
- A later confirmed deletion removes the cached object; an expired index entry,
  unknown hint, or transient storage failure does not.
- Private/session changes, schema filtering, media records, and overlapping
  discoveries preserve the current isolation and invalidation behavior.
- Early close cancels refresh work without unhandled rejection; Vue can display
  partial data alongside the existing error state.
