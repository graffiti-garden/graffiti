# Graffiti PouchDB Implementation

This is an implementation of the [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html)
using [PouchDB](https://pouchdb.com/).
It uses local storage either in the browser or in Node.js but can be configured
to use a remote CouchDB instance.

## Installation

In node.js, simply install the package with npm:

```bash
npm install @graffiti/implementation-pouchdb
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

```javascript
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

```javascript
import { GraffitiPouchDB } from "@graffiti-garden/implementation-pouchdb";
const graffiti = new GraffitiPouchDB({
  pouchDBOptions: {
    name: "http://admin:password@localhost:5984/graffiti",
  }
})
```

See the [PouchDB documentation](https://pouchdb.com/api.html#create_database) for more options.

## TODO

- Remove tombstones according to the `tombstoneRetention` setting.
- Implement `listOrphans` and `listChannels`.
- Seperate out login logic for usage as a backend for decentralized pods.
