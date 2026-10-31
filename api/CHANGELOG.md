# @graffiti-garden/api

## 1.4.0

### Minor Changes

- bc1b45b: - Return the masked original object in `continueDiscover` tombstones. This happens under the hood in implementations anyways and layers on top (e.g. syncrhonize) were doing in-memory caching to try to reverse it so they could correlate events. Now the agreement is explicit.
- bc1b45b: - Accept login options instead of a positional actor.
  - Login and logout accept a state option, which is echoed on its success or error event, including through login redirects.

## 1.3.0

### Minor Changes

- 32ccec9: Publish the packages from the consolidated monorepo with refreshed repository metadata, build tooling, and dependencies.
  
  Move runtime validation into its dedicated wrapper package, expand API conformance coverage, validate decentralized media size limits, and keep Vue component props reactive.
