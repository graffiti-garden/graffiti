# Graffiti Synchronize

This library wraps the [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html)
to propogate changes made from one method to corresponding listeners.

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
                "@graffiti-garden/wrapper-synchronize": "https://cdn.jsdelivr.net/npm/@graffiti-garden/wrapper-synchronize/dist/index.browser.js"
            }
        }
    </script>
</head>
```

In either case, you can then import the package like so:

```typescript
import { GraffitiSynchronize } from "@graffiti-garden/wrapper-syncronize";
const graffiti = new GraffitiLocal()
const graffitiSynchronized = new GraffitiSynchronize(graffiti)
```
