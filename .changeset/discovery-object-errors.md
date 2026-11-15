---
"@graffiti-garden/implementation-decentralized": patch
---

Report object validation failures and temporary DID/storage read failures as discovery errors while continuing the same inbox. Advance discovery checkpoints while remembering failed reads in the cursor; later polls retry only due messages with capped backoff, without replaying healthy results or waiting for retry timers. Temporary failures never record invalid/deleted labels. Single-object get and delete operations propagate these errors. The public API is unchanged; older discovery cursors expire and must be restarted.
