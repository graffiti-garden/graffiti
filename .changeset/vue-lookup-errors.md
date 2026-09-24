---
"@graffiti-garden/wrapper-vue": patch
---

Expose errors from Vue object, media, and identity lookups through composable refs and component slots instead of console logs. Failed lookups resolve to `null`; not-found results leave `error` as `null`.
