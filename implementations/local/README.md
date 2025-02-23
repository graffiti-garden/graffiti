# Graffiti Local Implementation

This is a local implementation of the [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html)
using [PouchDB](https://pouchdb.com/).
By default, it automatically persist data in both the browser and Node.js using
whatever stoage is available in each environment.
It can also be configured to use an external [CouchDB](https://couchdb.apache.org/) instance,
but using a remote database is insecure.

## Installation

In node.js, simply install the package with npm:

```bash
npm install @graffiti-garden/implementation-local
```

In the browser, you can use a CDN like jsDelivr. Add an import map the the `<head>` of your HTML file:
```html
<head>
    <script type="importmap">
        {
            "imports": {
                "@graffiti-garden/implementation-local": "https://cdn.jsdelivr.net/npm/@graffiti-garden/implementation-local/dist/browser/index.js"
            }
        }
    </script>
</head>
```

In either case, you can then import the package like so:

```typescript
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
const graffiti = new GraffitiLocal()
```

## Usage

This is an implementation of the Graffiti API,
so to use it please refer to the [Graffiti API documentation](https://api.graffiti.garden/classes/Graffiti.html).

The only major difference is that options can be passed to the constructor
to configure the PouchDB instance.
The PouchDB instance will create a local database by default,
in either the browser or Node.js.
However, you could configure it to use an external CouchDB instance as follows:

```typescript
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
const graffiti = new GraffitiLocal({
  pouchDBOptions: {
    name: "http://admin:password@localhost:5984/graffiti",
  }
})
```

See the [PouchDB documentation](https://pouchdb.com/api.html#create_database) for more options.

## Extending

Pieces of this implementation can be pulled out to use in other implementations.

```typescript
// The basic database interface based on PouchDB
import { GraffitiLocalDatabase } from "@graffiti-garden/implementation-local/database";
// The log in and out methods and events - insecure but useful for testing
import { GraffitiLocalSessionManager } from "@graffiti-garden/implementation-local/session-manager";
// Various utilities for implementing the Graffiti API
import * as GraffitiUtilities from "@graffiti-garden/implementation-local/utilities";
```

## TODO

- Remove tombstones according to the `tombstoneRetention` setting.
