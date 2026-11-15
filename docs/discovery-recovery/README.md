# Discovery recovery: review the small fixes first

Main includes #99, #100, #101, and #105. The remaining branches include those
merges. The public Graffiti API is unchanged.

## Ready for review

| PR | Purpose | Dependency |
| --- | --- | --- |
| [#102](https://github.com/graffiti-garden/graffiti/pull/102) | The pending recovery fix: report object-read errors and retry on the next poll, without caching failure as deletion. | Main |
| [#103](https://github.com/graffiti-garden/graffiti/pull/103) | Expire successful DID documents after one hour. The dependency's built-in cache never expires. | Main |
| [#104](https://github.com/graffiti-garden/graffiti/pull/104) | Add authenticated batch pin/unpin routes; keep send unauthenticated. | Main |
| [#109](https://github.com/graffiti-garden/graffiti/pull/109) | Bound small validation reads and decoded batch bodies. | #102 |

#102 and #109 are a native GitHub stack: each has its own diff and review, and
GitHub retargets the second layer when the first merges. #103 and #104 are
independent. Readiness means ready for human review, not an instruction to merge.

## Hold the larger drafts

- [#106](https://github.com/graffiti-garden/graffiti/pull/106) combines three concerns.
  After the small prerequisites land, divide it into: **verified deletion**,
  **automatic pinning and rollback**, then **removal of obsolete label/message
  APIs and cache plumbing**. This avoids another combined review-base branch.
- [#107](https://github.com/graffiti-garden/graffiti/pull/107) is the separate expiry
  feature. Its server code can be reviewed independently, but expiry must not
  deploy until publishers pin their announcements. Personal expiry stays disabled.
- [#108](https://github.com/graffiti-garden/graffiti/pull/108) is later operational
  tooling. It is not required to ship the recovery fix or pins: unaudited legacy
  entries remain exempt from expiry. Review it when preparing the data migration.

The existing #106 → #107 → #108 branch chain is packaging, not a requirement to
review all three together. Keep these drafts until their scope is settled. #106's
current `inbox-protocol-base` is only a temporary diff base, never a merge target.

## What to keep and what to simplify

Keep transient/permanent error separation, verified originals, deferred deletion
hints, stale-write protection, awaited publication pins/rollback, and cursor/sequence
safety under garbage collection. These protect against reproduced data-loss races
or enforce the agreed policy. The separate verification cache keeps that state out
of the raw inbox service; replacing it with `cacheLabel` would restore the leakage.

Removed redundant pin-attempt state, an unused validation argument/generic, an
iterator cast, an unnecessary cursor-map copy, personal-export retention changes,
and a redundant maximum-sequence query on every send. The large reduction should
come from separating concerns and deferring optional operational work, not removing
consistency checks to make the line count smaller.

[Cache-first replay with retained errors](./cache-first-reads.md) remains a proposal.
No production deployment, database audit, or migration has been run for this stack.
