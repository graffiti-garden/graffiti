---
"@graffiti-garden/implementation-decentralized": patch
---

Reuse identical actor/channel and allowed-list attestations while posting many objects. Concurrent requests share the same signing work, failed signatures remain retryable, and the cache stays bounded. This reduces repeated cryptographic work without changing the protocol or API.
