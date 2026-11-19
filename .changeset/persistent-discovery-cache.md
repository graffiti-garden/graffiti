---
"@graffiti-garden/implementation-decentralized": patch
---

Store discovery history and verification state in the Cache API so Safari can
retain them when it discards iframe IndexedDB on browser exit. Cached records
remain partitioned by embedding site. Web Locks preserve concurrent update
ordering, with in-memory storage when browser caching is unavailable.

Existing IndexedDB caches are not migrated; the first read refetches the data.
Public APIs, servers, and the data guard are unchanged.
