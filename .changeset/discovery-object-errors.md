---
"@graffiti-garden/implementation-decentralized": patch
---

Report object validation failures and temporary DID/storage read failures as discovery errors while continuing the same inbox. Temporary failures remain retryable on later polls without recording invalid/deleted labels; invalid content reports an error without holding back the checkpoint. Single-object get and delete operations propagate these errors. The public API is unchanged.
