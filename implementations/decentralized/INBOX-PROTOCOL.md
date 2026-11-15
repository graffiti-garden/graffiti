# Inbox pins and verified deletion

This protocol sits below the public Graffiti API. Apps do not choose pins or
interpret inbox retention. Storage holds objects; inboxes index announcements.

## Inbox API

All paths are relative to `/i/:inboxId`. Bodies and query results use CBOR.

| Operation | Authentication | Body / result |
| --- | --- | --- |
| `PUT /send` | None | `{ m: { t, o, m } }` → `{ id }`, 201 or 200 for a duplicate |
| `POST /pin` | Required | `{ ids: string[] }` → 204 |
| `POST /unpin` | Required | `{ ids: string[] }` → 204 |
| `POST /query` | Required for personal inboxes | Existing query/cursor body → `{ results: [{ id, m }], cursor, hasMore }` |
| `POST /export` | Personal inbox owner | Existing cursor body and query result shape |

Authentication/service discovery is unchanged. `/label/:id` and `/message/:id`
are removed. Query/export entries have no label or `pinnedByMe` field.

Pins are sticky, owned by the authenticated account, and need no renewal. A
personal inbox accepts only its owner's pins; a shared inbox accepts any account.
One pin keeps an entry. Unpin removes only the caller's pin. Each request accepts
1–100 IDs. A pin batch with a missing ID adds nothing and returns 404; unpinning
missing IDs succeeds. Retrying either operation is safe.

## Internal policy

- The author awaits pins in their personal inbox and their shared inboxes before
  `post` succeeds. Failed required sends/pins trigger best-effort removal of their
  pins and stored bytes, including raw media if descriptor publication fails.
- Sending to another actor's personal inbox stays unauthenticated and best effort,
  as before. The recipient pins validated messages in batches. Initially, valid
  means wanted. Shared readers do not automatically sponsor other authors' posts.
- Read-side pin failures preserve valid results, report a stream error, and retain
  the checkpoint for a later retry. A consumer closing early still triggers an
  attempt to pin delivered messages; failures after closure are logged.
- Confirmed deletion releases the caller's own pins. It cannot release another
  account's sponsorship. There are no author signatures or cross-server sender pins.

Rollback cannot guarantee cleanup while offline. There is no durable outbox or
automatic rescue of abandoned shared posts in this change.

## Verification and deletion

The inbox cache stores raw messages and pagination only. A separate protocol cache
stores verified originals, scoped to the reader, and known missing storage keys.
An atomic generation check prevents validation started before a deletion from
resurrecting that cached location. Query cache invalidation and batched replay from
the upstream optimization remain in place.

A deletion hint has metadata `{ d: true }` and a searchable object envelope naming
the URL. Its contents, storage key, and alleged original message ID are not proof.
Legacy `t` metadata is treated only as the same untrusted hint. No original message
is fetched from the inbox service.

Hints wait until the whole scan finishes, including other inboxes and validations.
Unknown originals are ignored. For known originals, check the opaque keys against
the actor's normally cached DID endpoint. Only a storage 404 removes a verified
location. Another live key keeps the object live. A tombstone uses the verified
original's contents and the query's filtering/masking, never the hint's payload.
Incomplete scans and transient failures defer this decision and retain the affected
checkpoints. Later verified announcements can restore the URL.

An unverified 404 produces no tombstone. It remains retryable for one DID cache
lifetime; a continuing 404 after normal resolution can refresh lets the checkpoint
advance. Fresh queries may check it again. This avoids both permanently rejecting a
new rotated key and replaying old missing announcements forever. Keep old storage
keys/endpoints available for roughly a day after publishing replacements; DID
documents normally expire after one hour. Storage failures never bypass that cache.

## Deployment

Deploy the additive pin routes/migration first (`0009_inbox_pins.sql`). Then ship
the matching client and server protocol together and apply
`0010_remove_inbox_labels.sql`. Old clients require an upgrade: this deliberately
does not maintain the old label API. New clients use fresh cache databases and
expire old discovery cursors. Existing original announcement bytes remain readable;
server labels are not used as migration evidence.

Apply `0011_inbox_retention.sql` before deploying retention. New unpinned shared
entries expire 30 days after arrival. Personal expiration stays disabled, and
legacy rows with NULL arrival times remain exempt until audited. Expiration means
“no longer indexed”; it never proves the stored object was deleted.

Query cursor validity uses the same 30-day interval. A continuation retains the previous
deadline through intermediate pages and renews only after catching up. Otherwise,
a very slow reader could keep extending a cursor while unread entries expired.
The anchor is captured before the query, so messages arriving during the query
are not older than the renewed cursor. A fresh paged scan has ordinary concurrent
change semantics, not a frozen snapshot. Old query cursor formats expire. Personal
exports keep their existing cursor behavior because personal entries do not expire.

Queries hide expired entries immediately; hourly cleanup removes at most 1,000
rows per run. Any pin prevents expiry. Removing the last pin after the original
arrival deadline makes the entry eligible immediately. Resending an expired entry
creates a new ID/sequence; resending a live duplicate does not renew its deadline.
A persistent sequence counter prevents garbage collection from reusing positions.
Message insertion and tag indexing commit together so queries cannot pass an
announcement before it becomes searchable.

Do not assign legacy arrival times based on old labels. Audit the original
announcements and seed sponsorship for verified live entries first. Leave unresolved
rows exempt until reviewed; never interpret missing storage as proof that an
unverified object was deleted.
