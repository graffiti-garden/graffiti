# Graffiti Wrapper for Vue.js

This is a [Vue.js](https://vuejs.org/) plugin that wraps around
the [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html)
to provide [reactive](https://en.wikipedia.org/wiki/Reactive_programming) versions
of various Graffiti API methods.
These reactive methods are available as both
[renderless components](https://vuejs.org/guide/components/slots#renderless-components),
which make it possible to create a whole Graffiti app in an HTML template,
and [composables](https://vuejs.org/guide/reusability/composables.html),
which can be used in the programmatic [composition API](https://vuejs.org/guide/extras/composition-api-faq.html).

[**Read the API documentation**](https://vue.graffiti.garden/variables/GraffitiPlugin.html).

## Installation

You must install this package along with Vue.js and an implementation of the Graffiti API.
In this example, we will use the [local implementation](https://github.com/graffiti-garden/implementation-local) of the Graffiti API, but any other would be similar.
In node.js, simply install them with npm:

```bash
npm install vue
npm install @graffiti-garden/implementation-local
npm install @graffiti-garden/wrapper-vue
```

In the browser, you can use a CDN like
[jsDelivr](https://www.jsdelivr.com/).
Add an import map the the `<head>` of your HTML file:

```html
<head>
    <script type="importmap">
        {
            "imports": {
                "vue": "https://cdn.jsdelivr.net/npm/vue/dist/vue.esm-browser.js",
                "@graffiti-garden/implementation-local": "https://cdn.jsdelivr.net/npm/@graffiti-garden/implementation-local/dist/browser/index.js",
                "@graffiti-garden/wrapper-vue": "https://cdn.jsdelivr.net/npm/@graffiti-garden/wrapper-vue/dist/browser/plugin.mjs"
            }
        }
    </script>
</head>
```

In ether case install the plugin in your Vue app as follows:

```typescript
import { createApp } from "vue";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";

createApp({})
  .use(GraffitiPlugin, {
    graffiti: new GraffitiLocal(),
  })
  .mount("#app");
```

[See live examples of both methods](https://vue.graffiti.garden/examples/)
