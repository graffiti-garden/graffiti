# Graffiti Wrappers

Graffiti wrappers layer additional functionality on top of an existing Graffiti implementation.
Generally, a wrapper takes an existing implementation of the [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html) as an input and produces another Graffiti implementation of the Graffiti API as output, which makes it possible to compose multiple wrappers together.

For example, the [runtime-types](./runtime-types/) wrapper adds runtime type-checking to any Graffiti implementation.

```
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiRuntimeTypes } from "@graffiti-garden/wrapper-runtime-types";

// An existing graffiti implementation
const graffiti = new GraffitiLocal();
// A wrapper that adds runtime type-checking to the graffiti implementation
const graffitiWrapped = new GraffitiRuntimeTypes(graffiti)

// Call Graffiti methods on the wrapped implementation as usual:
graffitiWrapped.post(...)
```

## Wrappers

| Wrapper | Description |
| --- | --- |
| [Runtime Types](./runtime-types/) | Validates Graffiti API arguments at runtime. |
| [Synchronize](./synchronize/) | Routes changes made or received in one part of an application to other parts of the application. A building block to implementing reactivity for [plugins](../plugins/). |
| [Data Guard](./data-guard/) | Asks for permission before a site accesses or modifies Graffiti data and provides tools for reviewing access history. |
| [iframe RPC](./iframe-rpc/) | Passes a Graffiti implementation between a host page and an iframe. |
