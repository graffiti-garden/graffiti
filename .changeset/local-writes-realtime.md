---
"@graffiti-garden/api": major
"@graffiti-garden/implementation-decentralized": minor
"@graffiti-garden/implementation-local": minor
"@graffiti-garden/implementation-realtime": minor
"@graffiti-garden/realtime": minor
"@graffiti-garden/wrapper-runtime-types": minor
"@graffiti-garden/wrapper-synchronize": minor
"@graffiti-garden/wrapper-iframe-rpc": minor
"@graffiti-garden/wrapper-data-guard": minor
---

Add `flush({ urls }, session)` and define write completion as durable local acceptance. Decentralized queues writes with a configurable `writeGracePeriod`, preserves their final URLs across retries, and cancels uploads deleted during the grace period.

Add the realtime implementation: ordinary Graffiti object discovery and Blob reads can use authenticated Trystero peers while persistence stays with the underlying implementation. Forward flush through the existing wrappers and explicitly flush realtime signaling records.
