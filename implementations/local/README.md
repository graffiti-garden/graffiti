# Graffiti PouchDB Implementation

This is an implementation of the [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html)
using [PouchDB](https://pouchdb.com/).
By default, it uses local storage either in the browser or in Node.js but can be configured
to use a remote CouchDB instance.

## Installation

In node.js, simply install the package with npm:

```bash
npm install @graffiti-garden/implementation-pouchdb
```

In the browser, you can use a CDN like jsDelivr. Add an import map the the `<head>` of your HTML file:
```html
<head>
    <script type="importmap">
        {
            "imports": {
                "@graffiti-garden/implementation-pouchdb": "https://cdn.jsdelivr.net/npm/@graffiti-garden/implementation-pouchdb/dist/index.js"
            }
        }
    </script>
</head>
```

In either case, you can then import the package like so:

```typescript
import { GraffitiPouchDB } from "@graffiti-garden/implementation-pouchdb";
const graffiti = new GraffitiPouchDB()
```

## Usage

This is an implementation of the Graffiti API,
so to use it please refer to the [Graffiti API documentation](https://api.graffiti.garden/classes/Graffiti.html).

The only major difference is that options can be passed to the constructor
to configure the PouchDB instance.
The PouchDB instance will create a local database by default,
in either the browser or Node.js.
However, you could configure it to use a remote CouchDB instance as follows:

```typescript
import { GraffitiPouchDB } from "@graffiti-garden/implementation-pouchdb";
const graffiti = new GraffitiPouchDB({
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
import { GraffitiPouchDBBase } from "@graffiti-garden/implementation-pouchdb/database";
// A wrapper around any implementation of the database methods that provides synchronize
import { GraffitiSynchronize } from "@graffiti-garden/implementation-pouchdb/synchronize";
// The log in and out methods and events - insecure but useful for testing
import { GraffitiSessionManagerLocal } from "@graffiti-garden/implementation-pouchdb/session-manager-local";
// Various utilities for implementing the Graffiti API
import * as GraffitiUtilities from "@graffiti-garden/implementation-pouchdb/utilities";
```

## TODO

- Remove tombstones according to the `tombstoneRetention` setting.
- Implement `listOrphans` and `listChannels`.
