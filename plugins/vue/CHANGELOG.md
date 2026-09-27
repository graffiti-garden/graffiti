# @graffiti-garden/wrapper-vue

## 1.4.1

### Patch Changes

- 7196fe2: Use a native download link for media fallback instead of navigating the document to its blob URL.

## 1.4.0

### Minor Changes

- 4f190db: Expose whole-discovery failures through `error`, keep the initial loading state until discovery completes, and make overlapping Get and Discover polls wait for the active poll.

## 1.3.1

### Patch Changes

- e3d3846: Expose errors from Vue object, media, and identity lookups through composable refs and component slots instead of console logs. Failed lookups resolve to `null`; not-found results leave `error` as `null`.

## 1.3.0

### Minor Changes

- 32ccec9: Publish the packages from the consolidated monorepo with refreshed repository metadata, build tooling, and dependencies.
  
  Move runtime validation into its dedicated wrapper package, expand API conformance coverage, validate decentralized media size limits, and keep Vue component props reactive.

### Patch Changes

- Updated dependencies [32ccec9]
  - @graffiti-garden/api@1.3.0
  - @graffiti-garden/wrapper-synchronize@1.3.0
