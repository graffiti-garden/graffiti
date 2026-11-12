---
"@graffiti-garden/api": patch
---

Reuse validators for cloned JSON schemas with a bounded LRU and share concurrent AJV initialization. Keep query schemas isolated: identifiers and references within a schema work, but separate queries cannot register schemas for one another.
