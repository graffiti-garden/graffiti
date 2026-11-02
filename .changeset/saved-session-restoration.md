---
"@graffiti-garden/implementation-decentralized": minor
---

Keep a local copy of browser logins so an embedding site can restore the same login without renewed cookie access or a startup network request. Clear the saved copy when an authenticated request reports that the login is no longer valid, and report logout when importing a different login for the same actor.

Continue checking shared cookies on each operation where they are available, so logout propagates locally without waiting for a server rejection. Remove stale local copies when observing shared-cookie logout.

No server changes are required.
