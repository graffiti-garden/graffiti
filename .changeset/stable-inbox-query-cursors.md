---
"@graffiti-garden/implementation-decentralized": patch
---

Send query continuation cursors in CBOR bodies at a stable endpoint URL so
browsers can reuse CORS preflights. Coordinate rollout with the inbox server;
authentication, cursor errors, and rate limits remain unchanged.
