# Automated Dependency Updates

This repository uses [Renovate](https://docs.renovatebot.com/) to check the npm
workspace for newer dependency versions and open pull requests for them. The
repository's update policy is defined in
[`.github/renovate.json`](../../.github/renovate.json).

Renovate proposes updates; it does not merge them automatically. Review each
pull request and merge it once CI passes and any required changeset has been
added.

## GitHub Setup

This setup only needs to be completed once by an owner of the
`graffiti-garden` organization:

1. Open the [Mend Renovate GitHub App](https://github.com/apps/renovate), select
   **Install**, choose **Only select repositories**, and select `graffiti`.
2. Wait for Renovate to process the repository. Because `renovate.json` is
   already committed to the default branch, it serves as the repository's
   onboarding configuration. If Renovate opens a **Configure Renovate** pull
   request anyway, review and merge it before expecting update pull requests.
3. Confirm that Renovate creates its Dependency Dashboard issue or its first
   update pull requests. If nothing appears after a few hours, check the app's
   repository access and ensure the repository is in Interactive rather than
   Silent mode in the Mend settings.

## Reviewing an Update

The existing [CI workflow](../../.github/workflows/ci.yml) builds, checks, and
tests every workspace on a Renovate pull request. Publishing and Pages
deployment only run after the pull request is merged to `main`.

Before merging:

1. Review the upstream release notes and the files changed by Renovate.
2. Confirm that CI passes.
3. If the pull request changes `dependencies` or `peerDependencies` in a
   published workspace, add a changeset for that workspace. Updates that only
   affect `devDependencies` do not need a changeset.

TODO: Reconsider automerge for patch-only `devDependencies` after the update
workflow has proved reliable. Before enabling it, protect `main` with a required
CI status check so GitHub cannot merge a failing update.
