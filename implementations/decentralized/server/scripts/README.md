# Audit legacy inbox entries

Run after migrations 0009–0011. The audit reads a database export and fetches object
bytes through the same DID/storage validation as the client. It does not write to
the server. Keep the snapshot and report private: they contain private object URLs
and storage metadata. Old labels are not exported or trusted.

From this server workspace, export the legacy rows:

```sh
npx wrangler d1 execute graffiti-db --remote --file scripts/inbox-audit.sql --json > /tmp/inbox-snapshot.json
npm run audit:inboxes -- --input /tmp/inbox-snapshot.json --report /tmp/inbox-report.json --plan /tmp/inbox-pins.sql
```

Use `--origin https://your-provider` for another provider. Output files must not
already exist. The tool prints counts and file paths, not object contents.

Review the report and SQL before applying anything. The plan contains only pins
for verified originals with a known local sponsor, plus arrival timestamps for
those pinned rows. It rechecks the message sequence/hash and sponsor's current
ownership, is idempotent, and leaves every other legacy row exempt from expiration.
It does not delete messages or reset existing arrival times.

| Status | Meaning / follow-up |
| --- | --- |
| `verified` | Bytes and attestations validate; eligible for the generated pin plan |
| `hint` | An untrusted deletion hint; never used as evidence to delete an original |
| `missing` | Storage reported absence; an unverified original cannot be proven deleted |
| `invalid` | The envelope, metadata, or complete stored contents failed validation |
| `unavailable` | A transport/DID failure prevented checking; rerun after recovery |
| `unresolved-sponsor` | No local author/recipient mapping; review ownership separately |

Apply reviewed SQL as a separate operator action. A partial application is safe:
the arrival timestamp is set only when the pin exists. The audit intentionally
does not automate retiring unresolved legacy entries. Missing an old key can mean
deletion, movement, or an announcement that never pointed to a valid object. Even
with one server, the surviving database alone does not distinguish those cases.
Retiring an inbox entry is an indexing decision, not a proof of object deletion.

After resolving the remaining rows, a separate reviewed migration can timestamp
or remove them. Keep a database backup and the report used for that decision.
