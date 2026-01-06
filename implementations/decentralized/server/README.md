# Creating database

```bash
npx wrangler d1 create graffiti-db
```

Add this to your `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "graffiti-db"
database_id = "YOUR_DATABASE_ID"
```

# Running locally

Initialize the database:

```bash
npx wrangler d1 migrations apply graffiti-db --local
```

# Deploying

Change the `wrangler.toml` file to use the production database and change the `BASE_HOST` to match the production environment.

```
npx wrangler d1 migrations apply graffiti-db  --remote
npm run deploy
```
