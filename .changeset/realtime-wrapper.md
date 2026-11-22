---
"@graffiti-garden/realtime": minor
---

Replace the experimental RealtimeRoom extra with the GraffitiRealtime wrapper, published under the same package name. Ordinary Graffiti methods use authenticated Trystero peers for frequent live activity while the supplied implementation owns persistence and flush. One-off and anonymous reads continue through storage.

Keep live history, cursors, and idle rooms short-lived and bounded. Wake continuous discovery on changes and pace empty polls for Vue autopoll. Use Graffiti signaling with explicit flushes, retry actor verification, and acknowledge readiness before sending live objects. Include a minimal Vue cursor demo and tests over Local and real Trystero connections.
