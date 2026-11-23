# @graffiti-garden/api

## 1.7.0

### Minor Changes

- 8e135ed: Add `flush(url, session)` to confirm a pending object write with storage. It resolves immediately when the session has no pending write at that URL. Failed writes remain available for retry.
  
  Permit object write methods to resolve after durable local acceptance, retaining their final URLs. Use flush before depending on object visibility to other devices. Media methods are unchanged. Local and the existing synchronous Decentralized implementation already persist before returning, so their flush completes immediately. The queued Decentralized implementation is a separate change.
  
  Forward flush through the runtime, synchronization, iframe RPC, and data-guard wrappers. Extend conformance tests to flush object changes before cross-instance reads.

## 1.6.0

### Minor Changes

- d0d0814: Reuse immutable object and media reads using the existing persistent inbox cache and native HTTP caching. Completed inbox queries remain reusable until invalidated or refreshed; storage responses allow browser caching for up to a year. Add `options.refresh`: getters reuse saved results by default; discovery and continuation refresh by default, with `refresh: false` allowing completed saved queries. Missing or incomplete results still fetch. Known deletions invalidate getters, verification stays fresh, and explicit Vue polls refresh. Remove Vue's separate image cache. Deploy clients that send explicit no-cache verification requests before the storage Worker enables long-lived responses.

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
