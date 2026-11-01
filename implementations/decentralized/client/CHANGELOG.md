# @graffiti-garden/implementation-decentralized

## 0.3.0

### Minor Changes

- 8f7fc5e: Mark newly stored records with an internal `kind`: `object` or `media`. Object and media methods share storage but only access records of their own kind. This prevents an ordinary post from impersonating a media descriptor and keeps media backing records out of the object API. The public Graffiti API, object values, and media bytes are unchanged.
  
  The decentralized wire format uses `r: 0` for objects and `r: 1` for media in both stored records and inbox metadata.
  
  Existing records without a kind retain the legacy behavior; no migration or media rewriting is needed. Older decentralized clients reject the new internal field, so update clients and reload existing tabs before using newly written records. Updated readers revalidate kind-bearing records that older clients labeled invalid, so those saved labels do not leave data hidden after an upgrade. For Social.Wiki, deploy the updated hosted guard before the Social.Wiki update; the kernel and lenses access decentralized data through that guard.
- 75b02f0: Accept wrapper addendums on Graffiti object and media URLs. Lookups and deletions use the canonical URL before the first literal `?` or `#`, allowing wrappers to attach metadata without changing the Graffiti API. Encoded characters within URL components remain part of the identifier, and existing undecorated URLs keep working.
  
  The local implementation also honors `getMedia`'s `maxBytes: 0` limit instead of treating zero as an omitted limit, and preserves the original MIME type and parameters when decoding stored media.

## 0.2.0

### Minor Changes

- bc1b45b: - Return the masked original object in `continueDiscover` tombstones. This happens under the hood in implementations anyways and layers on top (e.g. syncrhonize) were doing in-memory caching to try to reverse it so they could correlate events. Now the agreement is explicit.
- bc1b45b: - Accept login options instead of a positional actor.
  - Login and logout accept a state option, which is echoed on its success or error event, including through login redirects.

### Patch Changes

- Updated dependencies [bc1b45b]
- Updated dependencies [bc1b45b]
  - @graffiti-garden/api@1.4.0
  - @graffiti-garden/wrapper-runtime-types@0.2.0

## 0.1.8

### Patch Changes

- d905b62: Improve keyboard and screen reader access in Graffiti login, data guard prompts, media previews, and permission management. Add an optional accessible name for modal dialogs.
- Updated dependencies [d905b62]
  - @graffiti-garden/modal@1.2.0

## 0.1.7

### Patch Changes

- d1c0a93: Replace the guard's temporary login entry when opening account creation or handle recovery, while preserving app history for direct clients.

## 0.1.6

### Patch Changes

- af8e732: Keep the application in Back-button history when login, account creation, handle recovery, or cookie setup begins, while replacing temporary guard and OAuth pages.

## 0.1.5

### Patch Changes

- d4108bd: Replace login navigation history entries so the browser Back button does not return to the login flow after an app resumes.

## 0.1.4

### Patch Changes

- 0373b56: Release inbox query locks after each cached page so an open discovery stream does not block other tabs. Bound stalled inbox requests and lock waits, and handle background labeling failures.
  
  Allow synchronization listeners to close while waiting for updates, and close Vue discovery and synchronization streams independently.

## 0.1.3

### Patch Changes

- 3ce161f: Let people who forgot their handle choose a Graffiti provider and log in with a passkey.
- a87f397: Remember the last logged-in handle in localStorage instead of saving a placeholder password.

## 0.1.2

### Patch Changes

- 5fe01ce: Batch same-bucket storage verification reads during discover to reduce network requests, with an ordinary GET fallback for bucket servers that do not support batches.

## 0.1.1

### Patch Changes

- 1057536: Speed up decentralized discovery by coalescing simultaneous DID resolutions, allowing 128 concurrent object checks, prefetching inbox pages, and writing fetched messages to IndexedDB in batches.

## 0.1.0

### Minor Changes

- 32ccec9: Publish the packages from the consolidated monorepo with refreshed repository metadata, build tooling, and dependencies.
  
  Move runtime validation into its dedicated wrapper package, expand API conformance coverage, validate decentralized media size limits, and keep Vue component props reactive.

### Patch Changes

- Updated dependencies [32ccec9]
  - @graffiti-garden/api@1.3.0
  - @graffiti-garden/modal@1.1.0
