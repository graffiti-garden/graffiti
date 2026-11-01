---
"@graffiti-garden/implementation-local": minor
"@graffiti-garden/implementation-decentralized": minor
---

Mark newly stored records with an internal `kind`: `object` or `media`. Object and media methods share storage but only access records of their own kind. This prevents an ordinary post from impersonating a media descriptor and keeps media backing records out of the object API. The public Graffiti API, object values, and media bytes are unchanged.

The decentralized wire format uses `r: 0` for objects and `r: 1` for media in both stored records and inbox metadata.

Existing records without a kind retain the legacy behavior; no migration or media rewriting is needed. Older decentralized clients reject the new internal field, so update clients and reload existing tabs before using newly written records. Updated readers revalidate kind-bearing records that older clients labeled invalid, so those saved labels do not leave data hidden after an upgrade. For Social.Wiki, deploy the updated hosted guard before the Social.Wiki update; the kernel and lenses access decentralized data through that guard.
