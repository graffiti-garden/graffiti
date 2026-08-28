# Graffiti

Graffiti is a generic infrastructure that makes it possible to build a wide variety of social apps using only client-side code. Graffiti can be used to build apps like [Twitter](https://glitter.graffiti.garden/), [Messenger](https://parallax.graffiti.garden/), [Wikipedia](https://wiki.graffiti.garden/), [Uber](https://social.wiki/#/v?/rideshare), and [brand new types of social apps](https://social.wiki).

This monorepo defines:

- The Graffiti API: a minimal-but-expressive client-side TypeScript API that can be used to build a variety of social apps.
- Two implementations of that API, including the primary production implementation, which is *decentralized* so that users get to choose where their own data is stored and served from.
- Additional utilities that layer common functionality on top of the API.

An academic paper describing Graffiti was [published in UIST'25](https://dl.acm.org/doi/10.1145/3746059.3747627) where it was awarded "Best Paper".

## Project Structure

The heart of Graffiti is its [API](./api/), which defines the methods that clients use to build social apps. See the [API reference](https://api.graffiti.garden/classes/Graffiti.html) which documents those methods in detail.

"Below" the API, this monorepo provides two [implementations](./implementations/): a [local implementation](./implementations/local/) for testing and development, and a [decentralized implementation](./implementations/decentralized/) for production. The decentralized implementation defines a client-server protocol that allows clients to retrieve data from multiple generic Graffiti servers so that each user can store and serve their data from the server of their choice.

"Above" the API, this monorepo provides several utilities to make it easier to build apps. [Wrappers](./wrappers/) add layers of functionality such as [runtime type-checking](./wrappers/runtime-types/) and [inter-app synchronization](./wrappers/synchronize/). [Plugins](./plugins/) integrate Graffiti with frontend frameworks---currently only [Vue](./plugins/vue/) is supported but other frameworks like React and Solid.js will be available in the near future..

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

- [Node.js](https://nodejs.org/) 24 or newer
- npm 11.5.1 or a compatible npm 11 release

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

This monorepo uses [npm workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces) to manage many packages at the same time.
To work on one package, you can `cd` into its directory and run commands there as normal. Alternatively, you can run commands from the root directory and use the `--workspace` option to specify which workspace to target. For example:

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
3. Run `npm run validate` from the repository root before submitting.

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
