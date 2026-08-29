# Multi-site GitHub Pages Deployment

This repo includes documentation and applications that are deployed under several subdomains including `api.graffiti.garden`, `sync.graffiti.garden`, and `vue.graffiti.garden`. Due to Github pages limitations, each subdomain is owned by a separate repository. When this monorepo is pushed to, it builds all the sites once, then dispatches the external repositories to download and deploy their own copy of the build.

A list of the external repositories is maintained in [`pages-sites.json`](../../.github/pages-sites.json).

## Setup

### Setup This Repository

1. [Create a fine-grained GitHub token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
   that can access the repositories in
   [`pages-sites.json`](../../.github/pages-sites.json) with the permissions 
   **Contents: Read and write**.
2. In the monorepo, open **Settings -> Secrets and variables ->
   Actions -> Secrets -> New repository secret**. Add the token as
   `PAGES_DISPATCH_TOKEN`.
3. Next time the monorepo is pushed to, check the [CI](../../.github/workflows/ci.yml) workflow. It runs the root build, checks, and tests,
   then it should create archives for each external repository at `https://api.graffiti.garden/deployment-assets/`. The archives are named for each repository, e.g., [`glitter.tar.gz`](https://api.graffiti.garden/deployment-assets/glitter.tar.gz). The CI workflow then dispatches the external repositories to download and deploy their own copy of the build using the [deploy workflow](./deploy.yml).

### Setup in Each Pages Repository

For every new Pages site:

1. Ensure that running `npm run build` in the root of this monorepo produces the site's static output.
2. Create the external repository for the new site under the [`graffiti-garden` organization](https://github.com/graffiti-garden).
3. Add an entry to [`pages-sites.json`](../../.github/pages-sites.json) where `repository`is 
  the external repository name, `output` is the static output folder:

   ```json
   {
     "repository": "new-site",
     "output": "path/to/static/output"
   }
   ```

4. Give `PAGES_DISPATCH_TOKEN` access to the external repository with
   **Contents: Read and write**. No secret needs to be added to the external
   repository.
5. Copy [`deploy.yml`](./deploy.yml) from this repository to `.github/workflows/deploy.yml` in the
   external repository.
6. In the external repository set up Github Pages as usual by going to **Settings -> Pages**, then selecting **GitHub Actions** as the source. Set its custom domain and make sure to configure that domain's DNS CNAME to `graffiti-garden.github.io` and enable HTTPS.
7. Merge the monorepo changes into `main`. CI must validate the build, publish
   the new archive with the API Pages site, and then dispatch the external
   repository. Confirm its Pages workflow downloads the expected archive and
   that the configured domain loads correctly.
