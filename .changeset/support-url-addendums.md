---
"@graffiti-garden/implementation-local": minor
"@graffiti-garden/implementation-decentralized": minor
---

Accept wrapper addendums on Graffiti object and media URLs. Lookups and deletions use the canonical URL before the first literal `?` or `#`, allowing wrappers to attach metadata without changing the Graffiti API. Encoded characters within URL components remain part of the identifier, and existing undecorated URLs keep working.

The local implementation also honors `getMedia`'s `maxBytes: 0` limit instead of treating zero as an omitted limit.
