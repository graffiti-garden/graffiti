---
"@graffiti-garden/wrapper-data-guard": minor
---

Replace data-shape permissions with site-based access. Sites appear logged out until the user approves an identity; ordinary posts then need no further prompt. The guard stamps new objects with `value["via site"]`, allows creating sites and their parents to read and delete their data, and supports remembered cross-site read and delete decisions. Posts with `value["confirm with guard"]: true` require approval each time.

Add `withGuardSource` for nested sites, site-specific logout that includes descendants, account selection in the permissions viewer, and deferred browser storage setup during login. Media provenance is stored in a `graffiti-guard` MIME parameter, with no additional objects or URL extensions. File bytes, size limits, and media-type matching are unchanged; the parameter is removed from Blobs returned to apps. Exact read approvals are retained in memory for the page session.

Export `encodeGuardSiteId(path)` so embedding apps can expose synchronous site IDs using the same encoding as the guard's provenance stamps.

Migration: previous permission rules are ignored. Apps must omit the reserved `via site` field when reposting values, and schemas should allow the added provenance property. Upgrade clients and the hosted guard together, and use `withGuardSource` when relaying to nested apps so identity events respect site access. Unstamped files follow the same unknown-origin rule as unstamped objects: the guard permits reading and deleting them without prompting, subject to the underlying actor and allowed-list checks. Deploy with the updated local/decentralized implementations: they preserve MIME parameters and keep new media records separate from ordinary posts. Files with no MIME type are stamped as `application/octet-stream`.
