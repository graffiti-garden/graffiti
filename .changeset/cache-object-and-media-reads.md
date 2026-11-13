---
"@graffiti-garden/api": minor
"@graffiti-garden/implementation-decentralized": minor
"@graffiti-garden/wrapper-runtime-types": patch
"@graffiti-garden/wrapper-data-guard": patch
"@graffiti-garden/wrapper-vue": patch
---

Cache object and media lookups for ten minutes using the existing persistent inbox cache, and let browsers cache media bytes through HTTP. Known deletions invalidate cached lookups; discovery and storage verification still check the server. Pass `{ cache: "no-cache" }` as the fourth getter argument to explicitly revalidate. Remove Vue's image cache and forward explicit polls to the implementation's freshness option.
