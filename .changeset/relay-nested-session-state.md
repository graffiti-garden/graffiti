---
"@graffiti-garden/wrapper-iframe-rpc": minor
---

Preserve login and logout caller state through nested iframe redirects. Add stable connection `stateId` values and `createGraffitiRelay` to deliver pending results to frames created after the result arrives, followed by current session restoration. Preserve omitted optional arguments as `undefined` across RPC calls.

Replace the connection's `initialLoginResult` option with normal session events. Applications relaying through nested frames should use `createGraffitiRelay` and pass its `stateId` to `connect`, reusing the same ID after reload. Each ID must be unique within its containing host. RPC treats sessions and caller state as implementation-independent data.
