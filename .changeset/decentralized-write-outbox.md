---
"@graffiti-garden/implementation-decentralized": minor
---

Accept writes into a durable local outbox with their final URLs. The configurable `writeGracePeriod` defaults to 1000 milliseconds; deleting a post before upload cancels it. `flush(urls, session)` immediately settles selected writes, reporting failures without losing retryable data. Runtimes without persistent browser storage still wait for the storage service before resolving a write.

Resume pending writes after login and retry failed uploads with bounded concurrency. Remove completed and canceled writes; keep only bounded local discovery history, independent of persistent inbox caches. Share lock acquisition deadlines between discovery and the outbox, release locks before reading large snapshots, and avoid redundant Cache response headers.
