---
"@graffiti-garden/implementation-decentralized": patch
---

Accept the authenticated account's pin status (`p`) in inbox query/export results. Keep this account-specific metadata out of the shared announcement cache. Servers always return the new field; deploy only after clients accept it, since older clients reject unknown fields. Automatic pinning and the public Graffiti API are unchanged.
