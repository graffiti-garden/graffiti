---
"@graffiti-garden/api": minor
"@graffiti-garden/implementation-decentralized": minor
"@graffiti-garden/wrapper-runtime-types": patch
"@graffiti-garden/wrapper-data-guard": patch
"@graffiti-garden/wrapper-vue": patch
---

Reuse immutable object and media reads using the existing persistent inbox cache and native HTTP caching. Completed inbox queries remain reusable until invalidated or refreshed; storage responses allow browser caching for up to a year. Add `options.refresh`: getters reuse saved results by default; discovery and continuation refresh by default, with `refresh: false` allowing completed saved queries. Missing or incomplete results still fetch. Known deletions invalidate getters, verification stays fresh, and explicit Vue polls refresh. Remove Vue's separate image cache. Deploy clients that send explicit no-cache verification requests before the storage Worker enables long-lived responses.
