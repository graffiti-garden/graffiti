# @graffiti-garden/wrapper-data-guard

## 0.2.7

### Patch Changes

- d905b62: Improve keyboard and screen reader access in Graffiti login, data guard prompts, media previews, and permission management. Add an optional accessible name for modal dialogs.

## 0.2.6

### Patch Changes

- af8e732: Keep the application in Back-button history when login, account creation, handle recovery, or cookie setup begins, while replacing temporary guard and OAuth pages.

## 0.2.5

### Patch Changes

- d4108bd: Replace login navigation history entries so the browser Back button does not return to the login flow after an app resumes.

## 0.2.4

### Patch Changes

- 55e0021: Size permission prompts to the small viewport so mobile browser controls do not cut off the bottom of the dialog.

## 0.2.3

### Patch Changes

- 527ea56: Put data guard requests in hash rather than query parameters to avoid URI length issues.

## 0.2.2

### Patch Changes

- 662af40: Improve cookie setup on browsers with cross-site tracking protection by guiding users through the required confirmation steps, automatically opening first-party setup, and preserving clear retry and recovery paths.

## 0.2.1

### Patch Changes

- 6144629: Add a guided first-party setup flow for browsers that silently reject embedded cookie access, then return users to the application to continue.

## 0.2.0

### Minor Changes

- 3af1e90: Store remembered permissions as private Graffiti objects so they remain available across browser storage partitions and can be reviewed in the audit panel.
  
  Improve permission prompts and auditing with clearer data previews, exact and remembered decisions, site-wide blocking, request progress, active-page filtering, and a streamlined Graffiti-branded interface. Replace the imperative `audit()` helper with `auditUrl()`, which returns a link to the relevant audit panel.
