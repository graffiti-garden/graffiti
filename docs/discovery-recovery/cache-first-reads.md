# Proposal: replay cache before network finishes, retaining errors

Deferred for a separate review. No new Graffiti API option.

For discovery, start the normal refresh and yield already verified cached objects
without waiting for it. Merge fresh results and confirmed tombstones into the same
stream. Preserve origin/object error entries and fatal schema/cursor exceptions.
Apps can show cached data alongside an error, or discard results on error; the API
will not identify per-object freshness or a separate cache-complete phase.

## Implementation constraints

- Replay only verified originals in the current reader scope. Reapply schema,
  channels, masking, record kind, and known deletions. Raw inbox messages are not
  evidence that an object was validated.
- Advance inbox checkpoints after complete pages are cached. A failed page fetch
  preserves the last completed page; failed object verification keeps its own
  pending retry without holding the inbox checkpoint. Preserve deduplication and
  stale-write protection.
- Handle refresh rejections immediately and cancel work when the consumer closes.
  Preserve personal pin handling on early close.
- The current queue fills up to 128 messages before yielding. Merely moving raw
  replay earlier will still block small cached result sets on the next network
  page. A cache phase must be consumable without first filling that queue.

## Tradeoffs to resolve

Cached objects can briefly appear before a confirmed deletion. Index expiry and
network failure never prove deletion. Private data must remain scoped to the
current actor; logging out must not expose another actor's cached results.

Network failure is not guaranteed to be immediate. Browser detection varies,
small storage/inbox requests have deadlines, and DID/media reads have their own
policies. `navigator.onLine` is not proof that a particular service is reachable.

The current five-second initial-failure delay also throttles automatic polling.
Removing it alone can cause a tight offline loop. Keep throttling in this
implementation layer, applying it to future attempts, and test repeated failures.
Vue currently logs yielded discovery errors while its
existing `error` ref handles thrown failures; exposing yielded failures there is
a separate small change, requiring no public Graffiti API addition.

This design applies to streaming discovery. A getter cannot resolve cached data
and later reject the same promise, so preserve its existing `refresh` semantics.
`{ refresh: false }` already reuses completed cached queries, but cache misses still
use the network. Offline writes and durable retry queues are separate work.

## Acceptance cases

Verify early cached results with fewer and more than 128 entries; a later network
error without losing cached pages or pending objects; confirmed deletion versus
index expiry; session/schema/media isolation; concurrent invalidation; cancellation;
and bounded automatic polling with partial data plus a visible error.
