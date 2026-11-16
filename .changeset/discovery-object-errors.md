---
"@graffiti-garden/implementation-decentralized": patch
---

Report object validation failures and temporary DID/storage read failures as discovery errors while continuing the same inbox. Advance discovery checkpoints while retaining pending announcements in a Graffiti-owned cache alongside verification state; later polls retry only due messages with capped backoff, without replaying healthy results or waiting for retry timers. Temporary failures never mark objects invalid or deleted. Verification and getter caching no longer depend on inbox labels or cache internals. Single-object get and delete operations propagate read errors. The public API is unchanged; older discovery cursors expire and must be restarted.
