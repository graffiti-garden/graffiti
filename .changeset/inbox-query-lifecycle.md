---
"@graffiti-garden/implementation-decentralized": patch
"@graffiti-garden/wrapper-synchronize": patch
"@graffiti-garden/wrapper-vue": patch
---

Release inbox query locks after each cached page so an open discovery stream does not block other tabs. Bound stalled inbox requests and lock waits, and handle background labeling failures.

Allow synchronization listeners to close while waiting for updates, and close Vue discovery and synchronization streams independently.
