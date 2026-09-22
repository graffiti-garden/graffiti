# @graffiti-garden/wrapper-data-guard

## 0.2.1

### Patch Changes

- 6144629: Add a guided first-party setup flow for browsers that silently reject embedded cookie access, then return users to the application to continue.

## 0.2.0

### Minor Changes

- 3af1e90: Store remembered permissions as private Graffiti objects so they remain available across browser storage partitions and can be reviewed in the audit panel.
  
  Improve permission prompts and auditing with clearer data previews, exact and remembered decisions, site-wide blocking, request progress, active-page filtering, and a streamlined Graffiti-branded interface. Replace the imperative `audit()` helper with `auditUrl()`, which returns a link to the relevant audit panel.
