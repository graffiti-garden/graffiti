# Graffiti API

The Graffiti API makes it possible to build many different types of social applications
that naturally interoperate each other, all using only standard client-side tools.
This folder contains the abstract API, its documentation, and conformonce tests.

To build with the API: [**see the API Documentation**](https://api.graffiti.garden/classes/Graffiti.html)

## Read options

Object reads, media reads, and discovery accept an optional options object:

```ts
await graffiti.get(url, schema, { session });
await graffiti.getMedia(mediaUrl, accept, { session });
const stream = graffiti.discover(channels, schema, { session });
const updates = graffiti.continueDiscover(cursor, { session });
```

Omit `session` for public reads. Passing a session directly in the options slot
remains supported for existing callers. Implementations can use
`normalizeGraffitiReadOptions` from this package to handle both forms.

## Implementing the API

To implement the API, create a class that extends the abstract `Graffiti` class and implement its
methods and `sessionEvents` contract:

```ts
import { Graffiti } from "@graffiti-garden/api";

class MyGraffitiImplementation extends Graffiti {
  // Implement the abstract members documented in the API reference.
}
```

See the [implementations](../implementations/) folder for examples of how to implement the API.

### Conformance Tests

The `@graffiti-garden/api/tests` export provides Vitest suites that can be
reused by implementations. For example:

```ts
import { graffitiCRUDTests } from "@graffiti-garden/api/tests";

const useGraffiti = () => new MyGraffitiImplementation();
const useSession1 = () => ({ actor: "https://example.com/alice" });
const useSession2 = () => ({ actor: "https://example.com/bob" });

graffitiCRUDTests(useGraffiti, useSession1, useSession2);
```

Add equivalent discover and media suites as appropriate.
`graffitiLegacyReadSessionTests(useGraffiti, useSession1)` checks the legacy
positional session arguments; the other suites use options.

## Building the Documentation

To build the [TypeDoc](https://typedoc.org/) documentation, run:

```bash
npm run build:docs
```

Then run a local server to view the documentation:

```bash
cd docs
npx http-server
```
