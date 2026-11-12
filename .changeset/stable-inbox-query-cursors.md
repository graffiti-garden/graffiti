---
"@graffiti-garden/implementation-decentralized": patch
---

Negotiate CBOR query continuation bodies with compatible inbox servers so
browsers can reuse CORS preflights for a stable endpoint URL. Preserve URL
cursors for older servers and keep authentication, cursor errors, and rate
limits unchanged.
