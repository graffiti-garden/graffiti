---
"@graffiti-garden/implementation-decentralized": patch
---

Decode inbox query and export responses in the HTTP service. Apply the existing initial-page failure throttle to interrupted bodies, invalid CBOR, and malformed responses as well as request failures, preventing rapid polling loops without advancing the cached cursor.
