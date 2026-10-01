---
"@graffiti-garden/implementation-decentralized": patch
---

Speed up decentralized discovery by coalescing simultaneous DID resolutions, allowing 128 concurrent object checks, prefetching inbox pages, and writing fetched messages to IndexedDB in batches.
