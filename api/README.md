# Graffiti API

The Graffiti API makes it possible to build social applications that are flexible and interoperable.
This repository contains the abstract API and it's documentation.

[View the Documentation](https://api.graffiti.garden/classes/Graffiti.html)

## Building the Documentation

To build the [TypeDoc](https://typedoc.org/) documentation, run the following commands:

```bash
npm run install
npm run docs
```

Then run a local server to view the documentation:

```bash
cd docs
npx http-server
```

## Testing

We have written a number of unit tests to verify implementations of the API with [vitest](https://vitest.dev/).
Use them as follows:

```typescript
import { graffitiCRUDTests } from "@graffiti-garden/api/tests";

const useGraffiti = () => new MyGraffitiImplementation();
// Fill in with implementation-specific information
// to provide to valid actor sessions for the tests
// to use as identities.
const useSession1 = () => ({ actor: "someone" });
const useSession2 = () => ({ actor: "someoneelse" });

// Run the tests
graffitiCRUDTests(useGraffiti, useSession1, useSession2);
```

Then run the tests with:

```bash
npx vitest
```
