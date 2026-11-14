# @graffiti-garden/wrapper-vue

## 1.5.0

### Minor Changes

- f48eb26: Accept `{ session }` options in `get`, `getMedia`, `discover`, `continueDiscover`,
  and synchronization helpers. Vue read composables accept options with reactive fields,
  with `autopoll` moved into the discovery options. Legacy positional sessions (identified
  by a top-level `actor`) and the fourth Vue autopoll argument remain supported.
  
  Update implementations and deployed RPC/data-guard hosts before switching callers
  to the options form. Existing callers can keep using positional sessions throughout
  that rollout. The shared `normalizeGraffitiReadOptions` API utility handles both
  forms. Renderless Vue component props and caching behavior are unchanged.

### Patch Changes

- Updated dependencies [f48eb26]
  - @graffiti-garden/api@1.5.0
  - @graffiti-garden/wrapper-synchronize@1.5.0

## 1.4.5

### Patch Changes

- 2dc3386: Flush pending discovery updates when a poll completes, while retaining the 50 ms batching window for streamed results. Dependent queries no longer wait for the remainder of that window, and canceled discoveries clear their pending update timer.

## 1.4.4

### Patch Changes

- f6b4ad4: Preserve updates received while a synchronization listener's schema is compiling, and clean up pending listeners on cancellation or compilation failure.
  
  Republish the Vue browser bundle so its embedded synchronization wrapper includes the fix.
- Updated dependencies [f6b4ad4]
  - @graffiti-garden/wrapper-synchronize@1.4.1

## 1.4.3

### Patch Changes

- d905b62: Improve keyboard and screen reader access in Graffiti login, data guard prompts, media previews, and permission management. Add an optional accessible name for modal dialogs.

## 1.4.2

### Patch Changes

- 0373b56: Release inbox query locks after each cached page so an open discovery stream does not block other tabs. Bound stalled inbox requests and lock waits, and handle background labeling failures.
  
  Allow synchronization listeners to close while waiting for updates, and close Vue discovery and synchronization streams independently.
- 5c35a50: Reuse recently loaded images across `useGraffitiGetMedia` instances, while letting `poll()` fetch fresh media.
- Updated dependencies [0373b56]
  - @graffiti-garden/wrapper-synchronize@1.3.2

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
