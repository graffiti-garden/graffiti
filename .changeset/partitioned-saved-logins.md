---
"@graffiti-garden/implementation-decentralized": patch
---

Back up saved browser logins in Secure, partitioned cookies so a site can restore
the same login after Safari discards iframe localStorage, without requesting
cross-site cookie access again. Shared cookies still propagate logout when
available, and unauthorized responses clear the saved copy as before.

Keep localStorage for HTTP, blocked cookies, and records exceeding the cookie size
limit. Oversized replacements invalidate the old cookie rather than restoring
stale credentials. No server or public API changes are required.
