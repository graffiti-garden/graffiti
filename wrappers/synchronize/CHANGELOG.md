# @graffiti-garden/wrapper-synchronize

## 1.4.0

### Minor Changes

- bc1b45b: - Return the masked original object in `continueDiscover` tombstones. This happens under the hood in implementations anyways and layers on top (e.g. syncrhonize) were doing in-memory caching to try to reverse it so they could correlate events. Now the agreement is explicit.

### Patch Changes

- Updated dependencies [bc1b45b]
- Updated dependencies [bc1b45b]
  - @graffiti-garden/api@1.4.0

## 1.3.2

### Patch Changes

- 0373b56: Release inbox query locks after each cached page so an open discovery stream does not block other tabs. Bound stalled inbox requests and lock waits, and handle background labeling failures.
  
  Allow synchronization listeners to close while waiting for updates, and close Vue discovery and synchronization streams independently.

## 1.3.1

### Patch Changes

- 10d32c3: Keep completed Graffiti operations successful when a synchronization listener throws, while continuing to update other listeners.

## 1.3.0

### Minor Changes

- 32ccec9: Publish the packages from the consolidated monorepo with refreshed repository metadata, build tooling, and dependencies.
  
  Move runtime validation into its dedicated wrapper package, expand API conformance coverage, validate decentralized media size limits, and keep Vue component props reactive.

### Patch Changes

- Updated dependencies [32ccec9]
  - @graffiti-garden/api@1.3.0
