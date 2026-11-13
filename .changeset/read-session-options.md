---
"@graffiti-garden/api": minor
"@graffiti-garden/implementation-local": minor
"@graffiti-garden/implementation-decentralized": minor
"@graffiti-garden/wrapper-runtime-types": patch
"@graffiti-garden/wrapper-synchronize": minor
"@graffiti-garden/wrapper-iframe-rpc": patch
"@graffiti-garden/wrapper-data-guard": patch
"@graffiti-garden/wrapper-vue": minor
---

Accept `{ session }` options in `get`, `getMedia`, `discover`, `continueDiscover`,
and synchronization helpers. Vue read composables accept reactive options, with
`autopoll` moved into the discovery options. Legacy positional sessions (identified
by a top-level `actor`) and the fourth Vue autopoll argument remain supported.

Update implementations and deployed RPC/data-guard hosts before switching callers
to the options form. Existing callers can keep using positional sessions throughout
that rollout. The shared `normalizeGraffitiReadOptions` API utility handles both
forms. Renderless Vue component props and caching behavior are unchanged.
