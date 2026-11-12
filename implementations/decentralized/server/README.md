# Graffiti Server

This code implements the server side of the
[decentralized Graffiti architecture](../). It provides the account UI,
identity and OAuth/WebAuthn flows, storage buckets, and inboxes. The official
deployment is at [graffiti.actor](https://graffiti.actor/) as a [Cloudflare worker](https://developers.cloudflare.com/workers/) but we are actively looking to host
additional servers on other services. Contact us if you are interesting in hosting a Graffiti server.

## Overview

- The `web` directory contains the frontend interface for
  account creation and management as well as the Oauth authorization
  frontend. It is written with [Vue](https://vuejs.org/) and during
  deployment it is compiled with [Vite](https://vitejs.dev/) into
  to a set of static files.
- The `worker` directory contains the server-side logic. It is written
  using [Hono](https://hono.dev/).
  - The `worker/api` directory contains the API endpoints that are exposed
    to the client. These include endpoints for storing and retrieving data
    from storage buckets, and endpoints for sending and receiving messages
    from inboxes.
  - The `worker/app` directory contains the rest of the server application
    logic needed by the front end.

## Local development

After `npm ci` at the repository root:

```sh
cd implementations/decentralized/server
npx wrangler d1 migrations apply graffiti-db --local
npm run dev
```

This will start two local web servers for the front and back ends
respectively. Make sure to interact via the *front end* endpoint at
[https://localhost:5173](https://localhost:5173). You will need to click
through a "self signed certificate" warning.

As you change either the front or back end, the server will automatically
reload.

## Deployment

For first time deployments:

1. [Create a D1 database](https://developers.cloudflare.com/d1/get-started/#2-create-a-database) either
   using the Cloudflare dashboard or the `wrangler` CLI:

   ```bash
   npx wrangler d1 create graffiti-db
   ```

   Copy the database name, and ID into your `wrangler.toml` file:

   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "graffiti-db"
   database_id = "12345678-YOUR-DATA-BASE-ID0000000000"
   ```

2. [Create an R2 bucket](https://developers.cloudflare.com/r2/get-started/#2-create-a-bucket)
   using the Cloudflare dashboard.

   Copy the database name into your `wranger.toml` file:

   ```toml
   [[r2_buckets]]
   binding = "STORAGE"
   bucket_name = "graffiti-bucket"
   ```

3. Update `BASE_HOST` and `[[routes]]` to reflect your production domain.

4. Run `npm run deploy` to deploy the application.

In the future, simply run `npm run deploy` to update the application.

## Query cursor transport

Inbox query responses advertise `Graffiti-Cursor-Transport: body`, exposed
through CORS. After receiving this header from a query endpoint, clients may
continue with a CBOR `{ cursor }` body at the same URL. This lets browsers reuse
the CORS preflight cache instead of preflighting every distinct cursor URL.
The initial query body, authorization, cursor expiry, and rate limits are
unchanged. URL cursors remain supported for older clients; export continues
to use URL cursors.

The client learns support from ordinary successful responses, separately for
each endpoint and without a probe. An older server receives URL cursors. A
successful body-cursor response must acknowledge support before the client
consumes it; otherwise the client discards it and retries that cursor by URL.
Errors are returned unchanged, without a transport retry, and clear the
in-memory capability so the next caller uses the URL form. Consequently,
rolling back to a server that rejects body cursors can fail one in-flight
query. Keep body support available throughout rolling deployments to avoid
that interruption.

## OAuth TODOs

- **Service scopes:** An OAuth token can access all services belonging to its
  account, even if the client requested only one. However, this is not much of an issue as an account only ever has three services: one bucket, personal inbox, and shared inbox, and presumably access to one is granted
  with access to the others.
- **PKCE:** A code seen in an OAuth redirect URL could be exchanged by someone
  other than the client, for example a malicious browser extension or a local
  redirect interceptor. This is a less likely path in the current flow. Later,
  bind each code to a client-held verifier using S256 PKCE.
