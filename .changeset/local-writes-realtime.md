---
"@graffiti-garden/api": major
"@graffiti-garden/implementation-decentralized": minor
"@graffiti-garden/implementation-local": minor
"@graffiti-garden/wrapper-realtime": minor
"@graffiti-garden/realtime": minor
"@graffiti-garden/wrapper-runtime-types": minor
"@graffiti-garden/wrapper-synchronize": minor
"@graffiti-garden/wrapper-iframe-rpc": minor
"@graffiti-garden/wrapper-data-guard": minor
---

Add `flush({ urls }, session)` and define write completion as durable local acceptance. Decentralized queues writes with a configurable `writeGracePeriod`, preserves their final URLs across retries, and cancels uploads deleted during the grace period.

Remove canceled posts and completed uploads from the outbox. Keep only a bounded change history for local discovery, expiring older cursors through the existing API.

Start the grace period after acquiring the write lock so contention cannot cause an early upload. Share discovery's lock acquisition deadline with cache and outbox operations. Wake realtime discovery on changes instead of polling for them.

Reuse identical actor/channel attestations and bound concurrent background uploads so streaming does not repeat signature computation or accumulate overlapping upload passes.

Add the realtime wrapper: ordinary Graffiti object discovery and Blob reads can use authenticated Trystero peers while persistence stays with the underlying implementation. Forward flush through the existing wrappers and explicitly flush realtime signaling records.

Activate peer rooms only during frequent activity. Bound live history and cursor lifetimes, close idle rooms, and avoid queuing old changes for slow peers. Keep storage-only discovery cursors independent of unrelated local stream churn. Read pending uploads directly from the outbox so a missing discovery clock cannot silently suppress flush or background uploads.

Retry transient actor-verification failures and acknowledge readiness before sending live objects. Clean up failed or late signaling writes, and keep explicit refresh reads on the underlying storage path. Include a minimal cursor-sharing demo using the ordinary API.
