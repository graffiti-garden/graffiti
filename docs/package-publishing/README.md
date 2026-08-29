# npm Package Publishing

This repository uses [Changesets](https://changesets.dev/) to maintain package versions and changelogs. After the [CI workflow](../../.github/workflows/ci.yml) validates a push to `main`, it either creates or updates the **Version Packages** pull request, or publishes the packages when that pull request has been merged.

## One-time Setup

### Allow the Release Pull Request

In this repository, open **Settings -> Actions -> General**. Under **Workflow permissions**, enable **Allow GitHub Actions to create and approve pull requests**, then save the setting.

### Configure npm Trusted Publishing

Configure [trusted publishing](https://docs.npmjs.com/trusted-publishers/) for every workspace package. In each package's settings on [npmjs.com](https://www.npmjs.com/), find **Trusted Publisher**, select **GitHub Actions**, and enter:

- **Organization or user:** `graffiti-garden`
- **Repository:** `graffiti`
- **Workflow filename:** `ci.yml`
- **Environment name:** leave blank
- **Allowed actions:** `npm publish`
