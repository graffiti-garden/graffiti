# Running locally

Initialize the database:

```bash
wrangler d1 migrations apply graffiti-db --local
```

# Deploying

Change the `wrangler.toml` file to use the production database and change the `BASE_HOST` to match the production environment.
