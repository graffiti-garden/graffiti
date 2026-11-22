---
"@graffiti-garden/api": major
"@graffiti-garden/implementation-local": minor
"@graffiti-garden/implementation-decentralized": minor
"@graffiti-garden/wrapper-runtime-types": minor
"@graffiti-garden/wrapper-synchronize": minor
"@graffiti-garden/wrapper-iframe-rpc": minor
"@graffiti-garden/wrapper-data-guard": minor
---

Add `flush(urls, session)` with a required array of object or media URLs. It confirms pending writes with storage without flushing unrelated work. Empty arrays do no work; batches are not transactions. Failed writes remain available for retry.

Permit write methods to resolve after durable local acceptance, retaining their final URLs. Use flush before depending on visibility to other devices. Local and the existing synchronous Decentralized implementation already persist before returning, so their flush completes immediately. The queued Decentralized implementation is a separate change.

Forward flush through the runtime, synchronization, iframe RPC, and data-guard wrappers. Extend conformance tests to confirm object and media publication/deletion before reading from another instance.
