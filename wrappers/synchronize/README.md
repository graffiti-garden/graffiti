# Graffiti Synchronize

This library wraps the [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html)
so that changes made or received in one part of an application
are automatically routed to other parts of the application.
This is an important tool for building responsive
and consistent user interfaces, and is built upon to make
the [Graffiti Vue Plugin](https://vue.graffiti.garden/variables/GraffitiPlugin.html)
and possibly other front-end libraries in the future.

[**View the Documentation**](https://sync.graffiti.garden/classes/GraffitiSynchronize.html)

## Installation

In node.js, simply install the package with npm:

```bash
npm install @graffiti-garden/wrapper-synchronize
```

In the browser, you can use a CDN like jsDelivr. Add an import map the the `<head>` of your HTML file:
```html
<head>
    <script type="importmap">
        {
            "imports": {
                "@graffiti-garden/wrapper-synchronize": "https://cdn.jsdelivr.net/npm/@graffiti-garden/wrapper-synchronize/dist/browser/index.js"
            }
        }
    </script>
</head>
```

In either case, you can then import and contruct the class as follows:

```typescript
import { GraffitiSynchronize } from "@graffiti-garden/wrapper-syncronize";
const graffiti = new GraffitiLocal() // or any other implementation of the Graffiti API
const graffitiSynchronized = new GraffitiSynchronize(graffiti)
```
