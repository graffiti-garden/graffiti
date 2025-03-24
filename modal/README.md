# Graffiti Popup

This implements the login and logout methods of the [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html)
using [Solid OIDC](https://solid.github.io/solid-oidc/).

In the browser, when an application calls `graffiti.login()`, a dialog opens up that allows the user to log in either
locally (for demoing/testing) or with a Solid OIDC provider.
The `actor` IDs produced from Solid login are webId URLs that start with `http`,
while `actor` IDs produced from local login will not start with `http`.

The node.js interface is not currently implemented and just
returns an instance of
[`GraffitiLocalSessionManager`](https://github.com/graffiti-garden/implementation-local/blob/main/src/session-manager.ts),
but at some point it will be extended to use
[@inrupt/solid-client-authn-node](https://docs.inrupt.com/developer-tools/javascript/client-libraries/tutorial/authenticate-nodejs-web-server/).

## Usage

Install the package with:

```
npm install @graffiti-garden/solid-oidc-session-manager
```

Then use it in your application as follows:

```typescript
import { GraffitiSolidOIDCSessionManager } from "@graffiti-garden/solid-oidc-session-manager";

const sessionManager = new GraffitiSolidOIDCSessionManager();

sessionManager.sessionEvents.addEventListener("login", (event) => {
  console.log("Logged in as", event.detail.actor);
});

// Log in, in response to a user action
button.onclick = () => sessionManager.login()
```

See the [demo](./demo/index.html) for a full example.

## Development

Clone the repository, then install and build the package as follows:

```bash
npm install
npm run build
```

Then you can run the [demo](./demo/index.html) by running:

```bash
npx http-server
```

and navigating to [localhost:8080/demo](http://localhost:8080/demo).

### Image Compression

To make the `.jpg` image smaller, use:

```
cwebp -q QUALITY -m 6 -mt graffiti.jpg -o graffiti.webp
```

Where quality is a number between 0 (horrible) and 100 (perfect).
