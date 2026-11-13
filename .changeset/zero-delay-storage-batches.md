---
"@graffiti-garden/implementation-decentralized": patch
---

Flush partial storage batches with a zero-delay timer to avoid Chromium's timer throttling in hidden guard iframes. Reads queued before the callback still share a batch, though requests arriving across separate tasks may form smaller batches.
