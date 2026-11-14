---
"@graffiti-garden/implementation-decentralized": patch
---

Bound small storage validation requests, including response bodies, to 30 seconds. Apply streaming byte limits to batched responses as well as individual reads, preserving compressed-body support and the existing large-media read policy.
