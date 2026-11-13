---
"@graffiti-garden/implementation-decentralized": patch
---

Send inbox query and export cursors, and storage bucket export cursors, in CBOR
bodies at stable POST endpoints so browsers can reuse CORS preflights. Clients
require a server that accepts body cursors. Authentication, cursor errors and
rate limits are unchanged. Storage bucket export now uses POST instead of GET.
