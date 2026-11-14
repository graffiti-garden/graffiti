# @graffiti-garden/api

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

## 1.4.1

### Patch Changes

- 53364b5: Reuse validators for cloned JSON schemas with a bounded LRU and share concurrent AJV initialization. Keep query schemas isolated: identifiers and references within a schema work, but separate queries cannot register schemas for one another.

## 1.4.0

### Minor Changes

- bc1b45b: - Return the masked original object in `continueDiscover` tombstones. This happens under the hood in implementations anyways and layers on top (e.g. syncrhonize) were doing in-memory caching to try to reverse it so they could correlate events. Now the agreement is explicit.
- bc1b45b: - Accept login options instead of a positional actor.
  - Login and logout accept a state option, which is echoed on its success or error event, including through login redirects.

## 1.3.0

### Minor Changes

- 32ccec9: Publish the packages from the consolidated monorepo with refreshed repository metadata, build tooling, and dependencies.
  
  Move runtime validation into its dedicated wrapper package, expand API conformance coverage, validate decentralized media size limits, and keep Vue component props reactive.
