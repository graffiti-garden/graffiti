# Graffiti Solid OIDC Interface

This implements the login methods of the [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html)
using [Solid OIDC](https://solid.github.io/solid-oidc/).
When an application calls `graffiti.login()`, a dialog opens up that allows the user to log in either
locally (for demoing/testing) or with a Solid OIDC provider.
The `actor` IDs produced from Solid login are webIds that start with `http`, while
`actor` IDs produced from local login will not.

Currently, it is only meant to be used in the browser, but at some point it will be extended to use
[@inrupt/solid-client-authn-node](https://docs.inrupt.com/developer-tools/javascript/client-libraries/tutorial/authenticate-nodejs-web-server/)
to work in node.js as well.

## Development

Install and build the package as follows:

```bash
npm install
npm run build
```

Then you can run the [demo](./demo) by running:

```bash
npx http-server
```

and navigating to [localhost:8080/demo](http://localhost:8080/demo).
