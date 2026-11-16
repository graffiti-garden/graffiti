---
"@graffiti-garden/implementation-decentralized": minor
---

Replace inbox labels and individual-message reads with authenticated sticky pins and client-owned verification state. Posts await required pins and roll back storage on failure; validated personal messages are pinned in batches. Deletion hints only affect previously verified storage locations, are checked after the scan, and remain retryable on network failure. The public Graffiti API is unchanged. This requires the matching inbox server protocol; old caches and cursors expire.
