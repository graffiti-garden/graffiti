---
"@graffiti-garden/implementation-decentralized": patch
---

Batch same-bucket storage verification reads during discover to reduce network requests, with an ordinary GET fallback for bucket servers that do not support batches.
