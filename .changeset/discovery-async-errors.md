---
"@graffiti-garden/implementation-decentralized": patch
---

Handle prefetched discovery and queued validation rejections immediately, while propagating errors only when consumed. Fatal schema/cursor errors and inbox failures still terminate discovery; ordinary endpoint failures remain stream errors.
