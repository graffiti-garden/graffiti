---
"@graffiti-garden/implementation-decentralized": minor
---

Accept object writes into a durable local outbox with their final URLs. The configurable `writeGracePeriod` defaults to 1000 milliseconds; deleting a post before upload cancels it. `flush(url, session)` immediately settles one object write, reporting failures without losing retryable data. Media operations keep their existing storage path and bypass the object outbox. Runtimes without persistent browser storage still wait for the storage service before resolving a write.

Resume pending writes after login and retry failed uploads with bounded concurrency. Remove completed and canceled writes; keep only bounded local discovery history, independent of persistent inbox caches. Share lock acquisition deadlines between discovery and the outbox, release locks before reading large snapshots, and avoid redundant Cache response headers.
