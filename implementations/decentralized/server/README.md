# Graffiti Server

This server fulfills the Graffiti protocol as [currently defined here](https://github.com/graffiti-garden/implementation-decentralized).
The server is currently written to run as a [Cloudflare worker](https://developers.cloudflare.com/workers/), but in the future it may be modified
to run on other platforms or bare metal.

The official deployment live at [https://graffiti.actor](https://graffiti.actor/)

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

Clone the repository and install the dependencies:

```bash
git clone git@github.com:graffiti-garden/server.git
cd server
npm install
```

Then, set up the database:

```bash
npx wrangler d1 migrations apply graffiti-db --local
```

Finally, start the server:

```bash
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
