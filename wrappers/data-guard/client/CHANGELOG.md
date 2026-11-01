# @graffiti-garden/wrapper-data-guard

## 0.3.0

### Minor Changes

- 75b02f0: Replace data-shape permissions with site-based access. Sites appear logged out until the user approves an identity; ordinary posts then need no further prompt. The guard stamps new objects with `value["via site"]`, allows creating sites and their parents to read and delete their data, and supports remembered cross-site read and delete decisions. Posts with `value["confirm with guard"]: true` require approval each time.
  
  Add `withGuardSource` for nested sites, site-specific logout that includes descendants, account selection in the permissions viewer, and deferred browser storage setup during login. Media provenance is stored in a `graffiti-guard` MIME parameter, with no additional objects or URL extensions. File bytes, size limits, and media-type matching are unchanged; the parameter is removed from Blobs returned to apps. Exact read approvals are retained in memory for the page session.
  
  Export `encodeGuardSiteId(path)` so embedding apps can expose synchronous site IDs using the same encoding as the guard's provenance stamps.
  
  Migration: previous permission rules are ignored. Apps must omit the reserved `via site` field when reposting values, and schemas should allow the added provenance property. Upgrade clients and the hosted guard together, and use `withGuardSource` when relaying to nested apps so identity events respect site access. Unstamped files follow the same unknown-origin rule as unstamped objects: the guard permits reading and deleting them without prompting, subject to the underlying actor and allowed-list checks. Deploy with the updated local/decentralized implementations: they preserve MIME parameters and keep new media records separate from ordinary posts. Files with no MIME type are stamped as `application/octet-stream`.

### Patch Changes

- Updated dependencies [75b02f0]
  - @graffiti-garden/wrapper-iframe-rpc@0.3.0

## 0.2.8

### Patch Changes

- bc1b45b: - Accept login options instead of a positional actor.
  - Login and logout accept a state option, which is echoed on its success or error event, including through login redirects.
- Updated dependencies [bc1b45b]
- Updated dependencies [bc1b45b]
  - @graffiti-garden/api@1.4.0
  - @graffiti-garden/wrapper-iframe-rpc@0.2.0

## 0.2.7

### Patch Changes

- d905b62: Improve keyboard and screen reader access in Graffiti login, data guard prompts, media previews, and permission management. Add an optional accessible name for modal dialogs.

## 0.2.6

### Patch Changes

- af8e732: Keep the application in Back-button history when login, account creation, handle recovery, or cookie setup begins, while replacing temporary guard and OAuth pages.

## 0.2.5

### Patch Changes

- d4108bd: Replace login navigation history entries so the browser Back button does not return to the login flow after an app resumes.

## 0.2.4

### Patch Changes

- 55e0021: Size permission prompts to the small viewport so mobile browser controls do not cut off the bottom of the dialog.

## 0.2.3

### Patch Changes

- 527ea56: Put data guard requests in hash rather than query parameters to avoid URI length issues.

## 0.2.2

### Patch Changes

- 662af40: Improve cookie setup on browsers with cross-site tracking protection by guiding users through the required confirmation steps, automatically opening first-party setup, and preserving clear retry and recovery paths.

## 0.2.1

### Patch Changes

- 6144629: Add a guided first-party setup flow for browsers that silently reject embedded cookie access, then return users to the application to continue.

## 0.2.0

### Minor Changes

- 3af1e90: Store remembered permissions as private Graffiti objects so they remain available across browser storage partitions and can be reviewed in the audit panel.
  
  Improve permission prompts and auditing with clearer data previews, exact and remembered decisions, site-wide blocking, request progress, active-page filtering, and a streamlined Graffiti-branded interface. Replace the imperative `audit()` helper with `auditUrl()`, which returns a link to the relevant audit panel.
