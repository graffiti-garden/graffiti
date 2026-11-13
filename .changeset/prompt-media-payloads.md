---
"@graffiti-garden/implementation-decentralized": patch
---

Read media payloads immediately instead of waiting for a storage batch timer, which can be throttled in hidden guard iframes. Object-validation reads retain batching.
