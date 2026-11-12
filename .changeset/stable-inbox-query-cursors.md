---
"@graffiti-garden/implementation-decentralized": patch
---

Send inbox query and export cursors, and storage bucket export cursors, in CBOR
bodies at stable POST endpoints so browsers can reuse CORS preflights. Coordinate
rollout with the server; authentication, cursor errors, and rate limits remain
unchanged. Storage bucket export now uses POST instead of GET.
