---
"@graffiti-garden/implementation-decentralized": patch
---

Report object validation failures and temporary DID/storage read failures as discovery errors while continuing the same inbox. Advance discovery checkpoints while retaining announcements once in a shared message store; Graffiti keeps reader-scoped verification metadata and retry references. Later polls retry only due reads with capped backoff, without replaying healthy results or waiting for retry timers. Temporary failures never mark objects invalid or deleted. Verification and getter caching no longer depend on inbox labels or private HTTP-client caches. Single-object get and delete operations propagate read errors. The public API is unchanged; older discovery cursors expire and must be restarted.
