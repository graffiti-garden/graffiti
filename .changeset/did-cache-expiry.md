---
"@graffiti-garden/implementation-decentralized": patch
---

Expire successful DID lookups after one hour so clients learn rotated service endpoints. Concurrent lookups still share one request, failures remain retryable, and storage errors do not bypass the DID cache.
