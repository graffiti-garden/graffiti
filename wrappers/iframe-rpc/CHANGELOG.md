# @graffiti-garden/wrapper-iframe-rpc

## 0.4.0

### Minor Changes

- 8e135ed: Add `flush(url, session)` to confirm a pending object write with storage. It resolves immediately when the session has no pending write at that URL. Failed writes remain available for retry.
  
  Permit object write methods to resolve after durable local acceptance, retaining their final URLs. Use flush before depending on object visibility to other devices. Media methods are unchanged. Local and the existing synchronous Decentralized implementation already persist before returning, so their flush completes immediately. The queued Decentralized implementation is a separate change.
  
  Forward flush through the runtime, synchronization, iframe RPC, and data-guard wrappers. Extend conformance tests to flush object changes before cross-instance reads.

### Patch Changes

- Updated dependencies [8e135ed]
  - @graffiti-garden/api@1.7.0

## 0.3.3

### Patch Changes

- f48eb26: Accept `{ session }` options in `get`, `getMedia`, `discover`, `continueDiscover`,
  and synchronization helpers. Vue read composables accept options with reactive fields,
  with `autopoll` moved into the discovery options. Legacy positional sessions (identified
  by a top-level `actor`) and the fourth Vue autopoll argument remain supported.
  
  Update implementations and deployed RPC/data-guard hosts before switching callers
  to the options form. Existing callers can keep using positional sessions throughout
  that rollout. The shared `normalizeGraffitiReadOptions` API utility handles both
  forms. Renderless Vue component props and caching behavior are unchanged.
- Updated dependencies [f48eb26]
  - @graffiti-garden/api@1.5.0

## 0.3.2

### Patch Changes

- 0f92eea: Remove the transitional getMedia envelope and return structured-cloned Blobs directly. Deploy hosts only after consumers support direct Blobs (iframe RPC 0.3.1), then update consumers to this release after hosts have migrated. File-only metadata remains local. Republish the data-guard browser bundle with the updated RPC client.

## 0.3.1

### Patch Changes

- 1f6eac9: Pass immutable media Blobs through iframe RPC without reading a new ArrayBuffer at every hop. Keep the existing media envelope while consuming bundles update; the client also accepts a direct Blob so the envelope can be removed in a later coordinated cleanup.

## 0.3.0

### Minor Changes

- 75b02f0: Preserve login and logout caller state through nested iframe redirects. Add stable connection `stateId` values and `createGraffitiRelay` to deliver pending results to frames created after the result arrives, followed by current session restoration. Preserve omitted optional arguments as `undefined` across RPC calls.
  
  Replace the connection's `initialLoginResult` option with normal session events. Applications relaying through nested frames should use `createGraffitiRelay` and pass its `stateId` to `connect`, reusing the same ID after reload. Each ID must be unique within its containing host. RPC treats sessions and caller state as implementation-independent data.

## 0.2.0

### Minor Changes

- bc1b45b: - Accept login options instead of a positional actor.
  - Login and logout accept a state option, which is echoed on its success or error event, including through login redirects.

### Patch Changes

- Updated dependencies [bc1b45b]
- Updated dependencies [bc1b45b]
  - @graffiti-garden/api@1.4.0

## 0.1.1

### Patch Changes

- 32ccec9: Publish the packages from the consolidated monorepo with refreshed repository metadata, build tooling, and dependencies.
  
  Move runtime validation into its dedicated wrapper package, expand API conformance coverage, validate decentralized media size limits, and keep Vue component props reactive.
- Updated dependencies [32ccec9]
  - @graffiti-garden/api@1.3.0
