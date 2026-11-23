---
"@graffiti-garden/api": major
"@graffiti-garden/implementation-local": minor
"@graffiti-garden/implementation-decentralized": minor
"@graffiti-garden/wrapper-runtime-types": minor
"@graffiti-garden/wrapper-synchronize": minor
"@graffiti-garden/wrapper-iframe-rpc": minor
"@graffiti-garden/wrapper-data-guard": minor
---

Add `flush(url, session)` to confirm a pending object write with storage. It resolves immediately when the session has no pending write at that URL. Failed writes remain available for retry.

Permit object write methods to resolve after durable local acceptance, retaining their final URLs. Use flush before depending on object visibility to other devices. Media methods are unchanged. Local and the existing synchronous Decentralized implementation already persist before returning, so their flush completes immediately. The queued Decentralized implementation is a separate change.

Forward flush through the runtime, synchronization, iframe RPC, and data-guard wrappers. Extend conformance tests to flush object changes before cross-instance reads.
