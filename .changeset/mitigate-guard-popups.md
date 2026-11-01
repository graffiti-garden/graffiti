---
"@graffiti-garden/wrapper-data-guard": minor
---

Replace data-shape permissions with site-based access. Sites appear logged out until the user approves an identity; ordinary posts then need no further prompt. The guard stamps new objects with `value["via site"]`, allows creating sites and their parents to read and delete their data, and supports remembered cross-site read and delete decisions. Posts with `value["confirm with guard"]: true` require approval each time.

Add `withGuardSource` for nested sites, site-specific logout that includes descendants, account selection in the permissions viewer, and deferred browser storage setup during login. Media provenance is stored in a receipt linked from the media URL; exact media read approvals are retained in memory for the page session.

Migration: previous permission rules are ignored. Apps must omit reserved `via site` and `_guard` fields when reposting values, and schemas should allow the added provenance property. Upgrade clients and the hosted guard together, and use `withGuardSource` when relaying to nested apps so identity events respect site access. Receipt-bearing media URLs require implementations that support URL addendums.
