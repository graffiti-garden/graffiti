# Discovery recovery: review the small fixes first

Main includes the reviewed recovery and service/cache refactors through #102 and
#114, plus #103's DID-cache expiry. All remaining branches include those merges.
The public Graffiti API is unchanged.

## Ready for review

| PR | Purpose | Dependency |
| --- | --- | --- |
| [#104](https://github.com/graffiti-garden/graffiti/pull/104) | Add authenticated batch pin/unpin routes; keep send unauthenticated. | Main |
| [#109](https://github.com/graffiti-garden/graffiti/pull/109) | Bound small validation reads and decoded batch bodies. Tests now use the storage service's options argument. | Main |

These are independent and can merge in either order. Both pass full validation
and CI. Readiness means ready for human review.

## Hold the larger drafts

- [#106](https://github.com/graffiti-garden/graffiti/pull/106) combines verified
  deletion, automatic pinning/rollback, and removal of the label/message API.
  It now uses the merged shared message store and Graffiti-owned verification
  state. Bodies are stored once; failed reads, pins, and deletion checks retain
  pending work for later polls while inbox checkpoints advance. After #104 and
  #109 merge, separate these concerns into focused reviews and remove the
  temporary combined base.
- [#107](https://github.com/graffiti-garden/graffiti/pull/107) adds shared-entry
  expiry and safe cursor retention. Its server diff is separate, but deployment
  must wait for publishers to pin. Personal expiry stays disabled.
- [#108](https://github.com/graffiti-garden/graffiti/pull/108) adds read-only audit
  tooling and generates a reviewable legacy pin plan. It is not required to ship
  recovery or pins: unaudited legacy entries remain exempt from expiry.

The current branch chain is #106 → #107 → #108, with each PR showing only its own
layer. #106's `inbox-protocol-base` contains main plus #104 and #109 solely to
isolate its diff. Retarget to main after those prerequisites merge; never merge
into the temporary base.

## Ownership and deployment

The inbox service handles HTTP and decoding. Inbox history handles pagination
and throttling. The shared message store owns cache tables and immutable bodies;
Graffiti owns reader-scoped verification and retry policy. No `cacheLabel`, raw
database access, or retry policy crosses into the inbox service.

Deploy additive pins before the matching client/server protocol and migration
0010. Retention needs migration 0011 and publishers that pin. Audit-generated SQL
is a separate operator-reviewed step; unresolved legacy rows remain exempt.

[Cache-first replay with retained errors](./cache-first-reads.md) remains a proposal.
No production deployment, database audit, or migration has been run for this stack.
