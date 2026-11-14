# Discovery recovery and inbox pins: review guide

The public Graffiti API stays unchanged. The independent fixes preserve upstream
read options, media handling, batched storage reads, IndexedDB batching, and getter
invalidation. Pinning removes validation/label state from the raw inbox cache.

## Already reviewed and merged

- [#99](https://github.com/graffiti-garden/graffiti/pull/99): capture asynchronous
  prefetch/validation failures. Contains the earlier user-reviewed commits.
- [#101](https://github.com/graffiti-garden/graffiti/pull/101): require the original
  schema in continuation cursors, including the approved API-wide test extension.
- [#105](https://github.com/graffiti-garden/graffiti/pull/105): the previously
  reviewed edge-compression change. The streaming bucket reader is already upstream.

All remaining branches include these merges. No production deployment or database
migration is part of this review work.

## Remaining PRs, from smaller fixes to the protocol migration

Sizes are approximate production-code additions/deletions, excluding tests and docs.
Independent PRs can merge in either order; dependent PRs must follow their bases.

| PR | Purpose and review focus | Dependency | Size |
| --- | --- | --- | --- |
| [#103](https://github.com/graffiti-garden/graffiti/pull/103) | Expire successful DID documents after one hour; preserve concurrent request sharing and avoid caching failures. | Main | +16 / −1 |
| [#104](https://github.com/graffiti-garden/graffiti/pull/104) | Add authenticated batch `/pin` and `/unpin`; test ownership, independent sponsors, and atomic missing-ID failure. Legacy routes remain for this stage. | Main | About +90 |
| [#102](https://github.com/graffiti-garden/graffiti/pull/102) | The recovery patch previously under review: report transient object errors, continue the inbox, and retain the checkpoint for the next poll. Review `querySingleEndpoint` and object validation. | Main | +90 / −43 |
| [#109](https://github.com/graffiti-garden/graffiti/pull/109) | Bound small storage validation reads by 30 seconds and decoded batch size; reuse the existing streaming reader. | #102 | +18 / −3 |
| [#106](https://github.com/graffiti-garden/graffiti/pull/106) | Replace labels with automatic pins, verified originals, and deferred deletion checks. Read `INBOX-PROTOCOL.md`, then `verified-messages.ts`, then publication/validation/deletion in `4-graffiti.ts`. | #102, #103, #104, #109 | About 1,400 lines touched; net ~350 removed |
| [#107](https://github.com/graffiti-garden/graffiti/pull/107) | Shared-entry retention, safe cursor deadlines, monotonic sequences, and atomic message/tag insertion. Review migration 0011 and server query/send logic. | #106 | About 180 lines touched |
| [#108](https://github.com/graffiti-garden/graffiti/pull/108) | Read-only legacy-data audit and guarded SQL plan; reuses actual object/ticket verification. | #107 | About +160 |

These are new implementations unless marked as previously reviewed above. #102
continues the pending recovery patch; it does not repair old cached invalid labels.
The pinning migration discards those labels and starts fresh client caches.

#106 uses `inbox-protocol-base`, a temporary branch combining its independent
prerequisites so its diff shows only the migration. **Once those prerequisites merge,
retarget #106 to `main` before merging it.** Do not merge into the review base.
Then retarget #107 after #106 merges, and #108 after #107 merges. #109 can target
`main` once #102 merges. Do not merge the temporary combined base as its own PR.

## Decisions to verify in the larger PRs

- Send stays unauthenticated. Pins are sticky, authenticated, and owned by the
  caller. Authors await required pins; personal readers batch-pin valid messages.
  Other shared readers do not sponsor posts. No `pinnedByMe` field, author
  signatures, or inter-server sender authentication is added.
- A failed required post/pin triggers best-effort storage/pin cleanup. Losing the
  network can still leave partial work; there is no durable offline write queue.
- Only a verified original plus a storage 404 can produce deletion. Unknown hints,
  expired index entries, and network failures cannot. Another live storage key
  preserves the object. Normal DID caching stays enabled; no cache-busting loop.
- New unpinned shared entries expire after 30 days; personal expiry is disabled.
  A cursor renews only after catching up, not on every intermediate page. Legacy
  entries remain exempt until audited, since their arrival times are unknown.
- The additive server pins can deploy separately. Removing `/label` and `/message`
  requires a coordinated client/server upgrade and migration 0010. Old clients and
  old cursors deliberately expire; the public Graffiti API does not change.
- Audit output is a report and SQL to review, not automatic cleanup. Missing old
  storage cannot prove an unverified logical object was deleted. Unresolved rows
  stay exempt; applying the plan is a separate operational step.

Each implementation PR has focused regressions and has passed repository validation.
The combined stack is also validated together. New API-wide coverage is limited to
those small existing-test extensions approved earlier; protocol details stay in the
implementation tests.

## Deferred cache-first reads

[Replay cache before network finishes, retaining errors](./cache-first-reads.md)
is a design proposal, not implemented behavior. Read recovery and the pinning
migration can settle independently of that change.
