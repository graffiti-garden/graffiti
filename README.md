# Graffiti

Graffiti is a infrastructure that makes it possible to build a wide variety of social apps using only client-side code. Graffiti can be used to build apps like [Twitter](https://glitter.graffiti.garden/), [Messenger](https://parallax.graffiti.garden/), [Wikipedia](https://wiki.graffiti.garden/), [Uber](https://social.wiki/#/v?/rideshare), and [brand new types of social apps](https://social.wiki).

This monorepo includes:

- The Graffiti API which defines a minimal-but-expressive set of methods, like `login`, `post` and `discover`, that can be used to build a wide variety of social apps.
- Two implementations of the Graffiti API, including the primary production implementation which is *decentralized* so that users get to choose where their own data is stored and served from.
- Tools and examples built on top of the Graffiti API.

An academic paper describing Graffiti was [published in UIST'25](https://dl.acm.org/doi/10.1145/3746059.3747627).

## Project Structure

The heart of Graffiti is its [API](./api/), which defines the methods that can be used to build up social apps. See the [API reference](https://api.graffiti.garden/classes/Graffiti.html) which documents those methods in detail. The API is defined as a Typescript class.

"Below" the API, this monorepo provides two [implementations](./implementations/): a [local implementation](./implementations/local/) for testing and development, and a [decentralized implementation](./implementations/decentralized/) for production. The decentralized implementation defines a client-server protocol that allows clients to retrieve data from multiple generic Graffiti servers so that each user can store and serve their data from the server of their choice.

"Above" the API, this monorepo provides several utilities to make it easier to build apps which we classify as wrappers and plugins. [Wrappers](./wrappers/) add layers of functionality to an existing implementation such as [runtime type-checking](./wrappers/runtime-types/) and [inter-app synchronization](./wrappers/synchronize/). [Plugins](./plugins/) integrate Graffiti with frontend frameworks---currently only [Vue](./plugins/vue/) is supported but other frameworks like React and Solid.js will be available in the near future..

The repository also contains three relatively simple example apps that demonstrate how the API could be used to create apps like [Twitter](./examples/glitter/), [Messenger](./examples/parallax/), and [Wikipedia](./examples/wikiffiti/).

```text
┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────────┐
│  Glitter  │  │ Parallax  │  │ Wikiffiti │  │ Your App Here │
│ (Twitter) │  │(Messenger)│  │(Wikipedia)│  │      :)       │
└─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └───────┬───────┘
      └──────────────┴────────┬─────┴────────────────┘
                              ▼
           ┌──────────────────────────────────────┐
           │          Framework Plugins           │
           │ Vue, (planned: React, Solid.js, ...) │
           └──────────────────┬───────────────────┘
                              ▼
          ┌───────────────────────────────────────┐
          │                Wrappers               │
          │  ┌─────────────┐ ┌─────────────┐ ┌─┐  │
          │  │runtime-types│ │ synchronize │ │…│  │
          │  └─────────────┘ └─────────────┘ └─┘  │
          └───────────────────┬───────────────────┘
                              ▼
                    ┌───────────────────┐
                    │   Graffiti API    │
                    └─────────┬─────────┘
            ┌─────────────────┴─────────────────┐
            ▼                                   ▼
  ┌──────────────────┐               ┌──────────────────┐
  │      Local       │               │  Decentralized   │
  │ implementation   │               │  implementation  │
  └──────────────────┘               └────────┬─────────┘
                            ┌───────────┬─────┴───────┐
                            ▼           ▼             ▼
                      ┌──────────┐ ┌──────────┐ ┌──────────┐
                      │ Graffiti │ │          │ │ Graffiti │
                      │ Server 1 │ │   ...    │ │ Server n │
                      └──────────┘ └──────────┘ └──────────┘
```

## Development

### Requirements

- [Node.js](https://nodejs.org/)
- [npm](https://www.npmjs.com/)

See [`package.json`](./package.json) for the minimum required Node and npm versions.

Install all dependencies from the repository root:

```sh
npm ci
```

### Common Commands

```sh
# Build packages, documentation, and apps in dependency order
npm run build

# Type-check every workspace that provides a check script
npm run check

# Run every workspace test suite
npm test

# Build, type-check, and test everything
npm run validate
```

Some browser tests require Chromium. Install it with the same command used by CI:

```sh
npx playwright install --with-deps chromium
```

### Working on One Workspace

This monorepo uses [npm workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces) to manage many packages at the same time. Installation should only ever happen at the root, but otherwise you can `cd` into its directory and run commands there as normal. Alternatively, you can run commands from the root directory and use the `--workspace` option to specify which workspace to target. For example:

```sh
# Run the runtime-types wrapper tests
npm test --workspace=@graffiti-garden/wrapper-runtime-types

# Start the Glitter development server
npm run dev --workspace=@graffiti-garden/glitter
```

### Contributing

Before opening a pull request:

1. Keep changes scoped and update documentation and tests as needed.
2. Run the affected workspace's checks and tests while iterating.
3. If a published package's behavior changes, run `npm run changeset`, select the affected packages and version bumps, and commit the generated `.changeset/*.md` file. Documentation, test-only, and internal changes do not need a changeset.
4. Run `npm run validate` from the repository root before submitting your pull request.

Once a pull request is merged, no additional release work is needed. New package versions will be [published automatically](./docs/package-publishing/) and new documentation and example sites will be [deployed automatically](./docs/pages-deployment/).

## How to Cite

To cite Graffiti, you can use the following BibTeX:

```bibtex
@inproceedings{graffiti,
  title={Graffiti: Enabling an Ecosystem of Personalized and Interoperable Social Applications},
  author={Henderson, Theia and Karger, David R. and Clark, David D.},
  booktitle={Proceedings of the 38th Annual ACM Symposium on User Interface Software and Technology},
  pages={1--21},
  year={2025},
  url={https://doi.org/10.1145/3746059.3747627},
  DOI={10.1145/3746059.3747627},
  publisher={ACM},
  series={UIST ’25},
  collection={UIST ’25},
  ISBN={9798400720376}
}
```
