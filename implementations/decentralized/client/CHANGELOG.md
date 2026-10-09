# @graffiti-garden/implementation-decentralized

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
