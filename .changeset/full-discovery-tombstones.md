---
"@graffiti-garden/api": minor
"@graffiti-garden/implementation-local": minor
"@graffiti-garden/implementation-decentralized": minor
"@graffiti-garden/wrapper-synchronize": minor
---

- Return the masked original object in `continueDiscover` tombstones. This happens under the hood in implementations anyways and layers on top (e.g. syncrhonize) were doing in-memory caching to try to reverse it so they could correlate events. Now the agreement is explicit.
