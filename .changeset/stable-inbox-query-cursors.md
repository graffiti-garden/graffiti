---
"@graffiti-garden/implementation-decentralized": patch
---

Send inbox query and export cursors, and storage bucket export cursors, in CBOR
bodies at stable POST endpoints so browsers can reuse CORS preflights. Deploy the
server first, then publish/deploy clients. The server temporarily accepts URL
cursors, bodyless inbox exports and storage-export GETs for existing clients;
remove that bridge after clients update and old tabs reload. New clients require
the updated server. Authentication, cursor errors and rate limits are unchanged.
Storage bucket export now uses POST instead of GET.
