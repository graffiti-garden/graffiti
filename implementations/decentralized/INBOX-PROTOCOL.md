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
  failed pin IDs for a later poll while the inbox checkpoint advances. Closing a
  stream early still attempts to pin delivered messages; failures are logged.
- Confirmed deletion releases the caller's own pins. It cannot release another
  account's sponsorship. There are no author signatures or cross-server sender pins.

Rollback cannot guarantee cleanup while offline. There is no durable outbox or
automatic rescue of abandoned shared posts in this change.

## Verification and deletion

The shared message store holds each announcement body once. Inbox history owns
pagination; Graffiti owns reader-scoped verification metadata and retries. Atomic
updates prevent late validation from reviving a key observed missing. A retained
validation flag distinguishes verified originals from unverified missing entries.
Message keys and database tables stay private to the store; batched replay remains.

A deletion hint has metadata `{ d: true }` and a searchable object envelope naming
the URL. Its contents, storage key, and alleged original message ID are not proof.
Legacy `t` metadata is treated only as the same untrusted hint. No original message
is fetched from the inbox service.

Hints wait until the whole scan finishes, including other inboxes and validations.
Unknown originals are ignored. For known originals, check the opaque keys against
the actor's normally cached DID endpoint. Only a storage 404 removes a verified
location. Another live key keeps the object live. A tombstone uses the verified
original's contents and the query's filtering/masking, never the hint's payload.
Incomplete scans and transient failures retain pending URL checks in the discovery
cursor while inbox checkpoints advance. Reads, pins, and hint checks use capped
time-based backoff on later polls, never background retry timers. Each poll retries
at most 32 object reads per inbox and 32 deferred URL checks across the scan.
Later verified announcements can restore the URL.

An unverified 404 produces no tombstone. It remains retryable for one DID cache
lifetime; a continuing 404 after normal resolution can refresh marks that
announcement invalid. Pending 404s stay silent because absence is not a network
failure. Their retry references do not prevent the inbox checkpoint from advancing.
This avoids permanently rejecting a new rotated key or replaying old missing
announcements forever. Keep old storage
keys/endpoints available for roughly a day after publishing replacements; DID
documents normally expire after one hour. Storage failures never bypass that cache.

## Deployment

Deploy the additive pin routes/migration first (`0009_inbox_pins.sql`). Then ship
the matching client and server protocol together and apply
`0010_remove_inbox_labels.sql`. Old clients require an upgrade: this deliberately
does not maintain the old label API. New clients use fresh cache databases and
expire old discovery cursors. Existing original announcement bytes remain readable;
server labels are not used as migration evidence.

Shared-entry expiration, cursor retention, and legacy-data auditing are separate
follow-up changes. Personal inbox expiration stays disabled. Inbox expiration
means “no longer indexed”; it never proves the stored object was deleted.
