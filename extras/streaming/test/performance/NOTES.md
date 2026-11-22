# Streaming performance lab

2026-11-22. Synthetic camera (640 × 360, 15 fps) and continuous audio; no real
camera, microphone, or user account. Public Graffiti APIs remain the application
boundary. Changes stay uncommitted for review.

## Evidence from the version 6 reports

Only entries after the last `Page opened` belong to the current run.

- Publisher: 3,024 audio packets and 1,211 video frames in about 95 seconds.
  The source requests 50 audio packets and 15 video frames per second.
- Outbox puts averaged 30 ms, maximum 2,191 ms; deletes averaged 309 ms including
  queueing. Receiver outbox reads averaged 1,120 ms, maximum 3,309 ms.
- Twelve audio and five video objects reached bucket upload, already expired.
- The peer connection remained connected. The previous regression test used
  only one client instance and did not measure missing audio packets.

## Hypotheses to test

1. Other tabs invalidate the outbox's in-memory index on every write, causing
   repeated full-history scans. Test shared browser storage, then isolated storage.
2. Concurrent expired-frame deletions form a convoy on the global write lock,
   delaying fresh media. Compare sequential cleanup with the identical workload.
3. MoQ's default zero-age subscription skips audio after any short write delay.
   Count encoder output, posted packets, discovered packets and decoder output.
4. Realtime discovery's 50 ms polling adds jitter and batches packets. Measure
   capture-to-render latency and packet gaps before replacing polling.

## Method

The performance harness uses two actual browser pages and the decentralized
implementation's Miniflare worker (real bucket and inbox operations). Only test
account login and DID resolution are supplied by the fixture. Generated media
goes through MoQ, Graffiti, Trystero and the player. Separate-context runs require
peer delivery; same-context runs also exercise the shared durable outbox.

Report warmup separately from a steady interval. Record source/posted/received/
decoded counts, audio timestamp gaps, rendered video latency, post latency,
outbox scans and actual persistent uploads. Preserve raw reports in `/tmp` and
record comparable results and decisions here. Do not infer successful audio
playback from video FPS or from a nonzero audio byte count.

## Controlled results (Chromium, shared storage)

Same 2,000 deleted 4 KB objects, 30 second steady interval, 15 fps canvas and
50 audio packets/sec. Each row adds only the stated change. Counts at window
boundaries can differ by one packet because stages run at different times.

| Change | Audio encoded → posted → decoded | Video decoded/sec | Video lag median / p95 | Post p95 (audio) | Delete median |
| --- | --- | --- | --- | --- | --- |
| v6 baseline | 1500 → 1231 → 1193 | 14.60 | 136 / 296 ms | 35 ms | 147 ms |
| Sequential cleanup | 1500 → 1469 → 1451 | 14.93 | 129 / 164 ms | 23 ms | 1.3 ms |
| Bounded outbox journal | 1500 → 1485 → 1471 | 14.90 | 123 / 156 ms | 16 ms | 1.6 ms |
| MoQ ordered reader, 100 ms budget | 1500 → 1500 → 1500 | 14.97 | 119 / 151 ms | 17 ms | 1.7 ms |
| Event-driven discovery | 1501 → 1501 → 1501 | 14.93 | 118 / 149 ms | 18 ms | 1.6 ms |

Raw reports: `/tmp/graffiti-performance-{baseline,sequential,journal}.json`.
No audio/video bucket uploads in any of these runs; signaling and catalogs did
upload, proving that the real uploader ran.

Decisions:

- Keep sequential cleanup. It removes the lock convoy without changing storage
  or media semantics. Maximum post stall fell from 346 to 125 ms.
- Keep the journal. Cache key scans fell from 6/63 (sender/receiver) to 1/1.
  It has 256 fixed slots, no background service, and falls back to the existing
  full scan if a reader misses the window or an older writer leaves a gap.
- The remaining audio loss still happens before posting. Inspecting the pinned
  MoQ source confirms that the default subscription budget is zero: a new 20 ms
  packet makes the previous group obsolete. Next experiment uses MoQ's ordered
  reader with a 100 ms budget, replacing our manual group-skipping loop.

The ordered reader preserved every audio packet, with maximum decoded timestamp
gap 20.001 ms. It also forwards MoQ's end-of-group markers (so posted video
objects can outnumber encoded pictures). Event-driven discovery reduced median
video delivery from 34 to 4 ms and audio delivery from 79 to 51 ms. Playback still
includes the intentional 80 ms buffer. Both changes are retained.

## Firefox exposed additional storage contention

Playwright Firefox 153, same workload. Added an AudioWorklet side branch which
counts fully silent blocks in the actual rendered continuous test tone. This
distinguishes decoding from meeting playback deadlines. Chromium results alone
were insufficient.

| Change | Audio encoded → posted → decoded | Audio output silent | Longest silent interval | Audio post p95 |
| --- | --- | --- | --- | --- |
| Above changes, Firefox | 1500 → 1325 → 1290 | 22.64% | 368 ms | 78 ms |
| Instrumented repeat, journal in separate cache | 1500 → 1319 → 1283 | 24.92% | 739 ms | 68 ms |
| Filter channels in metadata before reading payloads | 1501 → 1392 → 1377 | 15.71% | 397 ms | 48 ms |
| Limit background payload reads to 8 | 1500 → 1361 → 1325 | 17.46% | 877 ms | 49 ms |
| Revert that limit; schedule uploads from metadata | 1500 → 1500 → 1500 | 0.57% | 24 ms | 19 ms |

- Profiling found 25,426 sender record reads in 30 seconds, for 1,685 puts.
  Channel filtering removed unrelated audio/video reads from signaling polls.
- Scheduling loaded all pending payloads twice simply to inspect their upload
  deadlines. Keeping account/deadline metadata in the existing index reduced
  record reads to 11,252 and preserved all audio packets. Retained.
- The read-concurrency experiment improved individual Cache response times but
  did not improve end-to-end audio. Reverted; no new concurrency knob retained.
- The journal uses a separate cache so old clients do not mistake its metadata
  for object records. Missing journal entries trigger a safe full-index rebuild.
- Next check: release the clock lock before journal body reads. Sequence numbers
  allow detecting a slot overwritten during the read, just as for a suspended tab.

Raw reports are `/tmp/graffiti-performance-firefox*.json`. Source video in these
Firefox runs encoded about 10 fps despite requesting 15; nearly every encoded
picture reached the decoder. Investigate the synthetic source separately before
attributing that difference to transport.

## Stronger workloads and rejected explanations

Reading journal bodies outside the clock lock preserved all 1,500 audio packets
in the 30 second Firefox run; actual tone silence fell to 0.21%, longest 16 ms.
With a fake camera, limiting background reads to eight **after** releasing that
lock also helped: 1,500/1,500 audio packets, 394/394 encoded video pictures,
0.20% silence, longest 35 ms. This is different from the earlier concurrency-only
experiment. The eight-read limit is currently retained.

Those short runs are not sufficient. Increasing history to 5,000 records, adding
the publisher's local preview, and running 60 seconds exposed a large failure:
3,000 audio packets encoded, only 551 posted and 337 decoded; 629 audio objects
reached persistence. Bounded background uploads (four at once, one scheduling
pass at a time) improved this to 1,209 posted / 738 decoded, still unacceptable.
Warming the reader index before starting did not fix it. Both indexes scanned
only once, so repeated full scans do not explain this remaining failure.

A native Cache microbenchmark rejected changing query-shaped keys to path-shaped
keys: no meaningful difference. Omitting the internal CBOR Content-Type header
does reduce Firefox cache costs as history grows (5000 records: mean match
0.46 → 0.18 ms, replacement 0.77 → 0.28 ms, separate browser contexts). These
headers are unused. However, the full workload still failed: 3,000 encoded,
1,663 posted, 1,421 decoded; 61% tone silence. Do not claim this solves streaming.
This run recovered after about 40 seconds of the measured interval. The reader
continued opening bodies quickly while publisher reads stalled.

Current investigation splits Cache lookup/body timing and captures a Gecko CPU
profile to explain publisher-specific contention. No larger playback buffer,
new transport API, or Cache URL migration has been introduced.

Raw reports: `/tmp/graffiti-performance-firefox-{soak,bounded-uploads,warm-reader,headerless,cache-profile}.json`.

## CPU profile: repeated signatures and garbage collection

The Gecko profile (`/tmp/graffiti-gecko.json`) separates a mostly idle receiver
from a busy publisher. In its 30–45 second interval, publisher minor collections
spent 11.9 seconds, 11.75 seconds in `MarkDebugger`. Signature scalar arithmetic
appears throughout those stacks. This particular GC amplification involves the
automated browser's debugger; it should not be presented as a measurement of the
user's uninstrumented browser. The unnecessary repeated cryptography is real:
`attest(actor, channel)` signs the actor, independent of each frame's value.

Cache up to 128 actor/channel attestations, share in-flight computation, and copy
the returned arrays. This preserves the exact cryptographic format and URL
construction. Existing signature-validation caching remains separate.

Identical 5,000-record / fake-camera / local-preview / 60-second workload:

| Change | Audio encoded → posted → decoded | Video encoded → decoded | Tone silence / longest gap | Audio post p95 | Audio / video lag median |
| --- | --- | --- | --- | --- | --- |
| Before attestation cache | 3000 → 1663 → 1421 | 834 → 775 | 61.0% / 39.6 s | 97 ms | 281 / 399 ms |
| Reuse identical attestations | 3000 → 2998 → 2996 | 787 → 787 | 0.60% / 96 ms | 6 ms | 100 / 130 ms |

The improved run uploaded zero audio/video objects, while catalogs and signaling
still persisted. Raw report: `/tmp/graffiti-performance-firefox-attestations.json`.
No playback-buffer change or special streaming API was needed. A longer run
with legacy header-bearing history and an isolated-storage peer run follow.

## Long-run continuity, not only packet counts

The 120-second legacy-history run retained 99.15% of encoded audio and virtually
all video, but still failed the audio-output criterion: 2.21% silence, longest
304 ms. Reducing storage tracing did **not** solve it (2.76%, longest 245 ms).
With headerless history, the same 120-second test reached 99.75% decoded audio
and 0.66% silence, but still had a 155 ms gap. Neither is a fully passing result.

Old headers increase p95 audio post latency from 6 to 28 ms. Actual p95 audio
delivery age reached 96 ms, beyond the fixed 80 ms playback override. A separate
bounded cache of channel public IDs did not improve this end-to-end workload
(2.94% silence), so it was removed. The successful actor/channel signature cache
is retained. There is no Cache URL migration or destructive history clearing.

Next comparison removes the fixed playback-delay override and uses MoQ's own
default. With no network RTT probe, the pinned library uses 100 ms network jitter
plus its rendition's codec/capture jitter. This is an upstream policy, not a new
adaptive controller in Graffiti. Keep the original checks (audio p95 < 200 ms,
video p95 < 300 ms, < 1% silent tone, longest gap < 100 ms) for this comparison.

Reports: `firefox-final-soak`, `firefox-light-soak`, `firefox-long-headerless`,
`firefox-channel-cache`. Detailed Cache/lock tracing is now opt-in through
`PERF_STORAGE_DETAILS=1`; encoder, decoder, playback, API and upload measurements
are always enabled.

MoQ's automatic playback policy reduced tone silence to 0.34%, but raised median
audio/video delay to 329/360 ms and still left a 187 ms gap. Rejected. Packet
counts show why buffering alone is insufficient: the publisher's 100 ms queue
budget has already discarded frames after a longer durable-write stall.

The next controlled setting uses a 250 ms publisher queue limit and a fixed
120 ms playback buffer. The former preserves packets across measured 100–200 ms
write stalls without adding any delay on the fast path. The latter covers the
measured delivery tail with a 40 ms increase over the original override. Both
use existing MoQ settings; no new queue controller or public API is added.

The 250/120 ms run preserved a continuous audio timestamp sequence (maximum
decoded gap exactly 20 ms), all 1,575 encoded pictures, and zero media uploads.
Median audio/video delay was 142/171 ms. Tone silence fell to 0.93%, but its
longest 147 ms gap still failed the strict continuity check. Testing 160 ms
playback next, with the same < 200 ms audio p95 limit, rather than relaxing the
check. Report: `/tmp/graffiti-performance-firefox-balanced.json`.

The 160 ms buffer raised median audio/video latency to 181/212 ms without
removing the worst pause (144 ms). Reverted to 120 ms. This is not a reason to
keep increasing latency. The original CPU profile specifically implicated
`MarkDebugger`; the next control seeds the same 5,000 legacy records in a
disposable page, then creates fresh calling pages in the same browser context.
Storage, history size, workload and acceptance criteria remain unchanged.
`PERF_FRESH_PAGES=1` enables this control. The original setup remains available.

## Accepted setting and verification

The fresh-page control passed every original threshold over 120 seconds with
5,000 legacy header-bearing records still present. Retain 250 ms publisher queue
budget / 120 ms playback buffer.

- Audio: 6,000 encoded, 5,996 posted/decoded in the measurement window; the
  decoded sequence had no internal gap beyond its normal 20 ms packet spacing.
- Video: 1,575 encoded / 1,574 decoded (13.1 fps source output).
- Audio delay median/p95: 143/152 ms. Video delay: 172/236 ms.
- Actual rendered tone: 0.63% silent blocks, longest gap 53 ms.
- Zero audio/video uploads; 37 metadata and 7 catalog uploads confirmed that
  persistence was active.

Raw report: `/tmp/graffiti-performance-firefox-preexisting-history.json`.
This supports the setup-overhead explanation for the largest pauses, consistent
with the earlier debugger GC profile. It does not make the retained-page stress
failures disappear: those remain recorded above. Do not increase the playback
buffer to accommodate an unbounded pause. Independent-account and Chromium
checks use this final production code.

Firefox with two accounts and isolated browser storage also passed (30 seconds):
1,500 audio packets posted, 1,499 decoded within the window with uninterrupted
20 ms spacing; 394/394 video pictures decoded. Median/p95 audio delay 137/144 ms,
video 172/231 ms; tone silence 0.11%, longest 32 ms. Zero media uploads.
Report: `/tmp/graffiti-performance-firefox-isolated-final.json`.

The original Chromium workload also passed with the final code (same-page seed,
2,000 records, canvas, 30 seconds). All 449 encoded video pictures were decoded,
and the decoded audio sequence had continuous 20 ms spacing (1,501 observed
outputs for 1,500 encodes inside the window, a boundary offset). Actual tone
silence was zero. Audio post p95 fell from the baseline's 35 ms to 3.1 ms.
Audio delay median/p95 was 134/142 ms; video 157/188 ms. The extra 40 ms playback
buffer is an intentional continuity tradeoff: median video delay rose from
136 ms while its p95 fell from 296 ms. No audio/video uploads.
Report: `/tmp/graffiti-performance-chromium-final.json`.

Final regression checks: 303 decentralized tests, 53 realtime unit tests,
1 realtime browser test and 6 streaming browser tests passed, plus all three
packages' TypeScript checks. The streaming suite includes the Opus polyfill,
access control, late joins, cancellation, cleanup and recovery from a four-second
write stall. MoQ still logs a nonfatal `AudioNode.disconnect` cleanup warning in
some tests; it is not a publication/playback failure. No upstream fork was added.
The final review also made journal updates best-effort after the durable record
is saved. A failed optional index must not reject an accepted write; a regression
test confirms another tab rebuilds and discovers that record.

## Reproducing the measurements

From the monorepo root, install Playwright's Chromium and Firefox if needed,
then build the actual browser packages used by the fixture:

```sh
npx playwright install chromium firefox
npm run build --workspace @graffiti-garden/implementation-decentralized
npm run build --workspace @graffiti-garden/wrapper-realtime
npm run build --workspace @graffiti-garden/streaming
PERF_LABEL=chromium npm run test:performance --workspace @graffiti-garden/streaming
PERF_BROWSER=firefox PERF_FAKE_CAMERA=1 PERF_HISTORY=5000 PERF_LEGACY_HEADERS=1 PERF_FRESH_PAGES=1 PERF_SECONDS=120 PERF_LABEL=firefox-soak npm run test:performance --workspace @graffiti-garden/streaming
PERF_BROWSER=firefox PERF_SHARED=0 PERF_FAKE_CAMERA=1 PERF_FRESH_PAGES=1 PERF_LABEL=firefox-isolated npm run test:performance --workspace @graffiti-garden/streaming
```

Run performance cases sequentially, without other test/build workloads. Shared
storage uses the same account in two pages; isolated storage uses two accounts.
Both require media to cross the real peer connection. History is seeded through
normal decentralized posts/deletes. `PERF_LEGACY_HEADERS=1` retains old response
headers in that history, checking upgrades without clearing user storage.
The optional `PERF_WARM_READER=1` isolates cold-index startup from steady state.
Reports include raw samples in `/tmp/graffiti-performance-<label>.json`.

These are same-machine, direct-peer browser measurements, not mobile or wide-area
network results. The fake camera's encoded cadence in Firefox is around 13 fps;
the test compares decoded pictures against actual encoder output. Tone silence
measures missed playback deadlines, not perceived speech quality. Decoding alone
does not establish audio continuity. Periodic sampling adds roughly one video
frame to the reported playback-age distribution.
This is not an hours-long memory soak: the outbox and realtime wrapper still
retain object history. That retention policy was not changed in this pass.

## November 22: v7 device logs, startup and abandoned streams

The four supplied logs separate several failures that steady-state tests did not
cover. Firefox-to-Firefox media advances once connected. The receiving Firefox
reports outbox.read calls as long as 33,882 ms. These timings include lock waits,
key enumeration, response-body reads and decoding; they do **not** identify disk
I/O as the cause. iOS posts no media, has one unfinished application post, and
only two completed outbox.put calls (about 5 seconds each). Its initial publishing
stall starts while the page is visible, well before its first hidden event.
Chromium gathers zero local ICE candidates. The user has asked to set that
browser-specific case aside and will use Chrome.

PR #90 is already incorporated: StorageBuckets uses a zero-delay batch timer.
Outbox.read itself has no timer. Signaling polls, frame cleanup and background
upload scheduling do have timers, so suspension remains a separate hypothesis.
The v8 demo records lock wait/held durations, cache operations, unfinished calls,
and a 1-second timer's actual lateness. No network or IP data is logged.

One definite lock problem: readIndex released its shared lock before reading
payloads, but still held it across Cache.keys(). Moved enumeration outside too;
the snapshot clock and journal preserve concurrent changes. A regression stalls
key enumeration and proves post/delete can finish before it resumes, then checks
the next cursor still sees both writes. This fixes that dependency; it does not
establish that it explains the iPhone failure. The 18 outbox tests and decentralized
typechecks pass.

Expanded the real-server harness to use different browser engines for sender and
receiver, and to add per-request network delay. Same-machine Firefox-to-Chromium
connects and meets the existing media thresholds. Measured time from starting
publication to 20 decoded video frames (includes about 1.5 seconds of media):

| Case | Time | Metadata uploads over run |
| --- | ---: | ---: |
| Firefox → Chromium, no history or injected delay | 3,144 ms | 19 |
| 2,000 history records, fresh pages, 400 ms per request | 9,301 ms | 32 |
| Same, Trystero trickleIce=false | 10,315 ms | 18 |
| Same, signaling poll 1,000 → 250 ms | 9,650 ms | 25 |

These are individual exploratory runs, not a statistically significant ranking.
Neither signaling change demonstrated a startup improvement, so both were
reverted. Bundled ICE can also wait up to Trystero's 15-second gathering deadline
when STUN is unavailable. The server's 1-second Retry-After still applies to
faster polling. Reports: `/tmp/graffiti-performance-cross-browser-baseline.json`,
`cross-browser-delayed.json`, `bundled-signaling.json`, and
`quicker-signaling.json` under the same filename prefix. New reports separately
capture first-video time, 20-frame time, and startup samples before warmup resets.

Abandoned stream cards had a separate protocol cause: announcements never
expired. Announcements now carry a 30-second lease, renew after 10 seconds and
flush independently of media, retaining the prior announcement until the next
is durable. Frames use the existing actor + random broadcast ID so immutable
announcement URL changes do not interrupt playback. The demo groups renewals by
that identity, ignores older tombstones, and expires cards even if the publisher
closes without deleting. Legacy announcements without expiry are excluded. This
is viewer-side expiry, not server garbage collection. The Local browser test
checks renewal, old URL deletion and continuous playback; all six streaming
tests and typechecks pass.

### Signaling, WebKit controls, and the missing catalog

The adapter dispatched async Trystero handlers concurrently. Its offer handler
decrypts before creating the answering peer; a later candidate can therefore
run before that peer exists and be discarded. Await each handler before sending
it the next discovery result. The new regression fails with the previous `void`
dispatch (`Candidate arrived before the peer existed`) and passes with `await`.
All 23 realtime-package unit tests and its typechecks pass. This removes handler
overlap; it does not impose an ordering guarantee on Graffiti itself. Deliberately
delayed offer writes are exercised separately in the native-browser fixture.

WebKit initially showed intermittent connection failure without slow local writes.
Subsequent runs succeeded. A retained-history fixture then appeared to rebuild
its index endlessly. Detailed tracing found its clock repeatedly missing, rather
than slow payload reads. The isolated `cache-lifecycle.mjs` control reproduces
silent Cache Storage loss in Playwright WebKit's nonpersistent context after
closing a page, including writes that resolve but cannot be read immediately.
The same control with a temporary persistent profile retains and reads records.
Performance tests now use temporary persistent WebKit profiles. This is **not**
evidence that normal iPhone Safari has the same bug; the device demo adds a cache
round-trip probe and last-read clock to check it directly. No production cache
fallback or clearing of user data was added on this evidence.

The reverse-direction fixture decoded all audio but initially played none:
WebKit's autoplay context was suspended. It now clicks an explicit unmute button,
as the real demo requires, after media setup. It does not relax Safari's autoplay
policy or request real capture devices.

With those controls fixed, the retained-history test exposed a real late-join bug:
WebKit ↔ Firefox ICE connected at 8 seconds, audio packets arrived at 9 seconds,
but the first decoded video waited until 37.2 seconds. Local cache operations
were fast and indexed normally. Channel replay used `refresh: false`; a completed
empty query from before publication omitted the already-flushed codec catalog.
Playback only began when MoQ later updated that catalog. Refreshing the channel
query on peer join fixes the replay instead of adding extra catalog heartbeats.
A wrapper regression models that stale empty cache; all 54 wrapper unit tests
and typechecks pass. The performance harness now also rejects a catalog wait of
five seconds after media packets start arriving.

Same 2,000-record history, fresh pages, WebKit publisher / Firefox receiver,
400 ms added to every storage request, ten-second steady-state window:

| Measurement | Cached replay | Fresh replay |
| --- | ---: | ---: |
| First decoded video after publication starts | 37,182 ms | 8,716 ms |
| First decoded video after first audio packet arrives | 27,674 ms | 212 ms |
| Audio playout delay median/p95 | 140.5/148.2 ms | 140.2/147.2 ms |
| Video playout delay median/p95 | 169/201 ms | 167/199 ms |
| Rendered tone silence | 0% | 0% |
| Audio/video objects uploaded | 0 | 0 |

Reports: `/tmp/graffiti-performance-v8-webkit-persistent.json` and
`/tmp/graffiti-performance-v8-fresh-replay.json`. Firefox → persistent WebKit also
passed with offers deliberately delayed by five seconds: 500/500 decoded audio
packets, continuous 20 ms spacing, zero tone silence, and zero media uploads.
Its audio median/p95 was 140/146 ms and video 172/247 ms. This confirms desktop
engine interoperability, not success on the user's particular iPhone/network.


## November 22: v8 phone failure and the outbox lifetime bug

The new iPhone run captured successfully but completed no application post and
uploaded no signaling. Cache.keys took 88,254 ms, its unfinished outbox scan had
run for 160 seconds, and its persisted mutation clock was 135,050. Firefox
completed about 56,000 cache reads on reopening. This was accumulated test
history, not a failure to acquire a camera or establish ICE. The three completed
phone lock callbacks each held the lock for at most 183 ms, whereas acquisition
waited up to 95,312 ms. Those logs do not identify the other holder or explain
all that queue time; v9 records active wait/held phases and anonymized lock-owner
categories rather than assuming an old tab was left open.

The underlying design error was retaining canceled writes and successful uploads
in the outbox indefinitely. Frame deletion canceled upload but retained the full
object as a tombstone. The previous metadata index optimized repeated reads of
that history instead of eliminating it. The outbox now deletes canceled records
and completed uploads, with no metadata index. A separate 1,024-entry change log
supports recent discovery, and older cursors raise GraffitiErrorCursorExpired.
One bounded in-memory cache avoids decoding the same log for each signaling
query; it is not a second index or an unbounded object archive. Results are copied
before consumers can mutate them. There is no compatibility migration for the
experimental cache. Clear the test site's data before trying v9; the migration,
format marker, startup wait, progress UI, and migration tests were removed at
the user's request. Normal canceled/completed writes are deleted immediately.

Discovery already kept query locks out of consumer yields and polling delays.
Its 30-second acquisition deadline is now shared by the cache helper and URL
uploads. The deadline aborts queued requests only; it never steals a held lock
or abandons a write in progress. Unit checks cover timeout cancellation, pending
write recovery, completed record removal, cross-instance discovery, bounded
retention, cursor expiry, and discovery-result mutation.

### Controls and the cleanup dependency

`cache-scale.mjs` isolates native Cache Storage in temporary WebKit profiles.
At 70,000 records, enumeration blocked a concurrent clock read for about five
seconds on this desktop. Moving synthetic keys from query strings into paths
made seeding/lookups much faster but did not remove enumeration cost (5.1 s vs
7.1 s). WebKit [indexes by the URL without its query and then checks matching
records](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/NetworkProcess/storage/CacheStorageCache.cpp).
No cache-key-format change was made: bounding retained data addresses this
outbox's cause without another format migration. The desktop control does not
reproduce the phone's full 88-second delay. Raw results:
`/tmp/graffiti-cache-scale-webkit-70000.json`.

The first pending-only cross-browser run kept the queue small but uploaded four
media frames. Once uploaded metadata leaves the outbox, deleting an obsolete
announcement can require an inbox request. The streaming collector awaited it
before removing subsequent frames. A four-item batch still had a barrier: one
slow item prevented the next sweep. Four independent cleanup workers, with a
small set preventing duplicate deletions, keep later sweeps moving. This belongs
in streaming and uses only the ordinary Graffiti API. The publisher also shares
its bounded recent log between queries; detailed tracing had shown 8,031 repeated
journal reads in a 20-second run.

Same WebKit publisher / Firefox receiver, fresh pages after 2,000 post/delete
operations, 400 ms delay per service request, 20-second measurement:

| Measurement | Initial pending-only run | Independent cleanup + cached log |
| --- | ---: | ---: |
| First decoded video | 8,364 ms | 9,301 ms |
| Audio packets decoded | 992 / 1,000 encoded | 1,000 / 1,001 encoded |
| Audio playout median / p95 | 135 / 144 ms | 154 / 159 ms |
| Video playout median / p95 | 165 / 197 ms | 182 / 213 ms |
| Rendered audio silence | 3.16% | 0% |
| Largest audio timestamp gap | 80 ms | 20 ms |
| Media objects uploaded | 4 | 0 |
| Pending records at end | 266 | 249 |
| Retained discovery changes | 1,024 | 1,024 |

Window boundaries can differ by one encoded/decoded packet. No playback latency
or drop-rate thresholds were relaxed. Reports:
`/tmp/graffiti-performance-v9-bounded-outbox.json`,
`/tmp/graffiti-performance-v9-concurrent-cleanup.json` (the unsuccessful batch),
and `/tmp/graffiti-performance-v9-independent-cleanup.json`.

The older browser test with stubbed successful uploads and empty remote queries
was removed: it depended on completed objects remaining in the outbox and could
not test actual post-upload reads/deletions. Decentralized integration is exercised
against the real Miniflare service in the performance harness. The read-cache race
fixture now flushes before warming the owner's verified cache and blocking a
second reader; previously its supposedly verified owner had only a pending write.

These changes bound the durable outbox and its discovery log. The realtime
wrapper still retains peer object history in memory for the current account's
lifetime; this is not yet a bounded-memory, hours-long streaming guarantee.


An abandoned recovery control cleaned a real WebKit profile containing
70,000 completed 4 KB records plus one unflushed write in 239 seconds.
The pending write retained bytes `[1, 2, 3]` exactly; canceling it then left only
the clock and format marker. Reopening afterward took 1 ms for outbox preparation.
This measured the discarded migration, not the final code: nothing has shipped,
and supporting old test data was unnecessary. Its control script was removed too.
Historical report: `/tmp/graffiti-outbox-recovery-70000.json`.

### Final simplification and longer runs

The four cleanup workers and their coordination set were replaced with two
serial loops: one removes expired frames, the other removes replaced metadata.
Metadata already uses expiry zero, so this needs no new tracking state. Even
multiple slow metadata reads cannot block frame cancellation. A Local integration
regression holds an announcement deletion open and verifies expired frames still
disappear, then releases it and checks final cleanup.

The shared lock deadline now uses a cancellable timer, cleared immediately on
acquisition. The previous AbortSignal.timeout form left each deadline alive for
30 seconds after its very short critical section. Avoiding those unused timers
is direct resource cleanup; the following runs do not isolate its performance
effect from changes to the synthetic video source.

All runs below use independent browser profiles, the actual decentralized service,
2,000 prior post/delete operations, fresh pages, and 400 ms added per HTTP request:

| 60-second run | Audio decoded / encoded | Video decoded / encoded | Audio p95 | Video p95 | Silence | Longest silence | Pending / history | Media uploads |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Firefox canvas → WebKit, before deadline cleanup | 2,934 / 3,000 | 567 / 569 | 189 ms | 255 ms | 3.36% | 832 ms | 205 / 1,024 | 0 |
| Firefox fake camera → WebKit, cleared deadlines | 3,000 / 3,000 | 900 / 900 | 145 ms | 189 ms | 0% | 0 ms | 225 / 1,024 | 0 |
| WebKit canvas → Firefox, separate cleanup loops | 3,000 / 2,999 | 882 / 882 | 145 ms | 196 ms | 0.41% | 115 ms | 207 / 1,024 | 0 |
| WebKit canvas → Firefox, final code without migration | 3,000 / 2,999 | 882 / 882 | 137 ms | 196 ms | 0.062% | 19 ms | 264 / 1,024 | 0 |

The first run had a 903 ms post stall and failed delivery/playout thresholds;
Firefox canvas capture also produced only about 9.5 fps despite 15 fps drawing.
The fake-camera control produced 15 fps and passed all thresholds. The last run
delivered every encoded frame but narrowly failed the unchanged 100 ms maximum
silence threshold. Its worst post took 147 ms and worst audio delivery 275 ms,
exceeding the 120 ms playback buffer. No buffer increase or threshold relaxation
was made to hide that outlier. First video arrived in 8.6–9.4 seconds in these
deliberately delayed-network runs. Reports:
`/tmp/graffiti-performance-v9-final-webkit-receiver.json`,
`/tmp/graffiti-performance-v9-cleared-deadlines.json`, and
`/tmp/graffiti-performance-v9-final-separated-cleanup.json`.

The final no-migration run passed every measurement threshold: audio median
130 ms, video median 164 ms, and first video in 8.3 seconds with the same delayed
service. Raw report: `/tmp/graffiti-performance-v9-no-migration.json`. The extra
audio packet is a measurement-window boundary, not synthesized/repeated media.
Removing the migration does not explain all differences between these runs;
short storage/scheduling stalls remain a tail-latency risk.

The failed run also exposed a test teardown race: delayed route callbacks could
reach Miniflare after disposal. Waiting for those routes and catching canceled
responses hung shutdown: Playwright still considered some routes in progress.
After stopping both media pipelines, teardown now uses Playwright's
unrouteAll({ behavior: "ignoreErrors" }) before closing the contexts. Errors
during measurement remain visible; only the remaining shutdown callbacks are
ignored. A final 20-second WebKit → Firefox run completed successfully with no
unhandled errors (50 prior post/delete operations, otherwise the same setup).
Report: `/tmp/graffiti-performance-v9-shutdown.json`.

The final production code passed 306 decentralized tests, five Local streaming
tests (including blocked metadata cleanup), and both package type checks.


## v10: reload failure and retention audit (2026-11-22)

### Evidence from the four v9 device logs

The successful iPhone run opened at 17:20:26Z, opened capture at 17:20:30.722,
and connected WebRTC at 17:20:33.649. Firefox decoded its first video at
17:20:34.958. The phone posted 2,993 frames; after stopping, its outbox was
empty and its discovery clock was 6,010. Signaling and metadata uploaded;
no audio/video frames did.

After reloading both pages, the phone opened at 17:22:12 and captured at
17:22:22. It posted 6,052 frames, had about 243 pending records, but reported
`outboxClock: null`, no uploads, and no peer connections. Firefox uploaded
37 signaling records and made offers, receiving no remote candidates. This
is not evidence of a TURN or capture failure, nor of another huge pending queue.
The phone repeatedly scanned a small queue without uploading it.

`flush()` and background scheduling incorrectly used discovery's fenced
outbox snapshot. With an unreadable clock it captured zero, then excluded every
record with `modified > 0`, falsely reporting no pending work. A focused test
removes the clock while leaving two pending records: selected flush and timed
background upload must both work. It failed before the fix and passes now.
Uploads now enumerate pending records directly. Completion also compares the
actual write identity and tombstone state, not the discovery sequence, so a
clock reset cannot erase a deletion accepted during an upload.

Why the clock was unreadable on the phone is still unknown. The synthetic
control in `cache-reload.mjs` uses a persistent WebKit profile, 1,000 writes,
256 rotating 4 KB records, page reloads and a browser restart. Query/path keys
and both headerless/CBOR-header responses all retained and read the clock.
Report: `/tmp/graffiti-cache-reload.json`. No key migration, recovery sweep,
or Safari-specific storage fallback was added. The demo instead records the
clock at page opening and one read-back after its first clock write.

### Assumptions removed

- A one-off discover should not open a peer room. Two activities within one
  second activate a channel; idle rooms close after five seconds.
- A live consumer need not resume an arbitrarily old cursor. Live cursors and
  entries expire after five seconds, with at most 1,024 entries per account.
  Falling behind that window raises the existing CursorExpired error. Passive
  wrapper cursors retain the underlying cursor lifetime; they have no live TTL.
- A new peer does not need the entire persistent channel replayed. Storage
  already supplies that history. Only the short live window is eligible for
  initial replay, with a one-second replay budget.
- A slow peer does not need every old update queued behind it. The channel
  permits one send in flight per peer and skips new live changes while busy.
  This also avoids building Trystero's internal outgoing promise chain.
- A slow finite storage query should not retain the entire call merely to
  deduplicate live results. Active-query duplicate tracking is capped too.
- Both MoQ ends need the latest codec catalog, not every revision forever.
  The player's catalog retention is zero (MoQ always keeps its latest group).
  The publisher disables Broadcast's default infinite catalog tracks and
  serves its catalog through the existing public API with the same retention.
  No MoQ fork or new codec/transport implementation is involved.
- Pending uploads and discovery history are different things. Uploads no
  longer rely on the history cursor/clock at all.

A storage-only cursor that has never exposed a matching pending local object
can refresh an expired local overlay without losing its persistent inbox
cursors. A cursor that did expose pending objects still expires when its
bounded local deletion history is unavailable; silently omitting those
possible deletions would be incorrect. The wrapper does not shorten or clear
the persistent implementation's caches.

### Retention boundaries

Normal streaming keeps roughly three seconds of frame objects until their
one-second cleanup pass removes them. Pending uploads are removed on success
or cancellation; the durable local change journal remains capped at 1,024.
The wrapper's live window is independently capped at 1,024/five seconds.
Signaling has its existing two-minute TTL, with one identity binding per room;
leaving a room removes those records. Media groups retain three seconds;
superseded codec catalogs are discarded. Playback reordering is limited to
the current group and 8 MB.

These bounds concern live work/history, not arbitrary durable application
data. Failed durable writes remain pending for retry, as required by post/flush.
Persisted stream announcements, catalogs and signaling use the persistent
implementation's normal caches; this change does not wipe those caches or add
an unrelated global storage eviction policy. An unresponsive persistence
service can still leave real metadata deletion work outstanding. Actual media
frames should never upload in this demo's five-second grace period.

### Verification

A real-service synthetic WebKit-to-Firefox call was stopped, both pages reloaded
in their existing profiles, and a second call measured with 150 ms added to
each HTTP request. The 30-second reload run decoded 1,500/1,500 audio packets
and 441/441 video frames, with zero silence, audio p95 146 ms and video p95
203 ms. First video arrived in 6.5 seconds including delayed signaling. It
retained 215 pending records, 1,024 journal entries and 586 live entries;
no audio/video frames uploaded. Report: `/tmp/graffiti-performance-v10-reload.json`.

A second reload run deliberately made every outbox clock read return undefined,
matching the failed phone observation while preserving the pending records.
It connected in 4.7 seconds and decoded 1,500/1,500 audio packets and 441/442
video frames. Audio p95 was 143 ms, video p95 203 ms, with zero silence. It
retained 213 pending records and 598 live entries, with zero audio/video uploads.
Report: `/tmp/graffiti-performance-v10-missing-clock.json`. These controlled
results prove the upload fix's independence from that clock; they do not prove
what made the physical phone's clock disappear.

All three package type checks pass. The decentralized suite passes 307 tests,
the wrapper passes 58 unit/conformance tests, and streaming passes five Local
integration tests, including late joins and cleanup while metadata deletion
is blocked. Initial sandboxed full-suite/build attempts failed to open local
sockets; rerunning with permission for the local test servers/build IPC passed.


The two-minute reload run passed all unchanged performance thresholds with
150 ms per service request: 6,001/6,004 audio packets and 1,764/1,765 video
frames decoded (50 audio packets/s, 14.7 video fps). Audio median/p95 was
140/148 ms; video 171/202 ms. Silence was 0.209%, with a 91 ms longest gap.
The counts sampled at 0/30/60/90/120 seconds were:

| Seconds | Pending outbox | Local journal | Live entries |
| ---: | ---: | ---: | ---: |
| 0 | 248 | 1,024 | 567 |
| 30 | 226 | 1,024 | 536 |
| 60 | 206 | 1,024 | 610 |
| 90 | 259 | 1,024 | 570 |
| 120 | 210 | 1,024 | 536 |

No audio/video frames uploaded; first video followed the post-reload share in
6.5 seconds. Report: `/tmp/graffiti-performance-v10-long.json`. This verifies a
steady live working set over thousands of frames, not an hours-long total heap
measurement or a guarantee about unrelated persistent caches.

A final source review found one more hidden queue: repeated
`Promise.race([pendingStorage, liveChange])` adds an uncancellable reaction to
the same pending storage promise on every live wakeup. A standalone 1,000-wakeup
control counted 1,000 retained reactions. Discovery now attaches one completion
handler per storage request and wakes the existing change signal when ready;
it does not race the same pending promise repeatedly. The existing blocked-read
regression was extended to 100 successive live deliveries and eventual storage
completion. A global Promise.then spy was unsuitable for Vitest's own async
instrumentation and was discarded; it was not a production failure.


The first 60-second run of the final wakeup code, again with deliberately
unreadable outbox-clock reads, connected in 6.5 seconds but failed the unchanged
performance assertions. At measurement second 20, simultaneous audio/video
posts took 1,139/1,127 ms and deletion took 1,134 ms. Audio delivery afterward
remained around 200 ms before playback buffering. It posted 2,918/2,998 audio
packets and decoded 2,910; audio p95 was 315 ms, silence 3.78%, longest gap
1.165 seconds. Three media objects (two audio, one video) uploaded around
second 21 because cleanup missed their grace deadlines. The live working set
still stayed bounded: pending 264/242/206 and live 565/546/582 at 0/30/60 seconds.
Report: `/tmp/graffiti-performance-v10-final.json`. This is a real failed
measurement, not a pass, and neither the buffer nor thresholds were increased.
A normal-clock control with detailed cache timing follows to distinguish the
unreadable-clock stress from the wakeup change; a single run cannot establish
which caused the stall.

Abrupt page termination is a separate durability boundary: already accepted
writes can remain pending if the streaming helper never gets to delete them.
A later restart may persist them. The current post/flush contract retains
accepted writes; this audit does not secretly change it into a crash-discardable
outbox. The device test stops sharing before reload so it checks reconnection
without introducing that separate failure mode.


The detailed normal-clock control on the final wakeup code met every media,
latency and retention threshold: 3,001/3,005 audio and 882/884 video decoded,
audio/video p95 160/213 ms, 0.209% silence (91 ms maximum), no media uploads,
and a 183 ms worst post. Pending records were 255/264/240 and live entries
506/570/557 at 0/30/60 seconds. This does not reproduce the previous one-second
stall. Report: `/tmp/graffiti-performance-v10-final-clock-control.json`.
Its test still failed because WebKit reported two unpin requests as page errors
with “due to access control checks”; aborted requests around warmup navigation
are the suspected cause, not proven by the original untimestamped error list.
The harness now explicitly flushes cleanup before reload and asserts the
pending outbox is empty, matching the device instructions' stop-and-wait step.
This also checks full decentralized cleanup, instead of only Local cleanup.
It does not filter the errors or relax the assertions.


With cleanup flushed before navigation, the final normal-clock reload test
passed every assertion, including the empty pre-reload outbox: first video
5.3 seconds, audio/video p95 142/198 ms, zero measured silence, zero media
uploads. It decoded 1,500/1,505 audio packets and 441/442 video frames in the
30-second measurement window. Pending records were 253 then 250; live entries
490 then 557. Report: `/tmp/graffiti-performance-v10-final-clean-reload.json`.
The last replay simplification iterates the existing bounded live window rather
than copying an array for each joining peer; a slow send therefore does not pin
that entire old window. All 58 wrapper tests pass after it.

The remaining architectural cost is explicit in the current draft API:
`post()` promises durable local acceptance. Every frame therefore still incurs
local Cache Storage writes. Keeping only short realtime history removes stale
work but cannot eliminate that disk latency. Relaxing this promise until flush
could make the outbox volatile and avoid per-frame durability, but would be a
separate API-semantic decision, not a hidden cleanup optimization. No such
change was made here, and the clock-fault run's long storage stall remains a
recorded limitation rather than a concealed passing result.


## 2026-11-22 — v11 separation and lifetime audit

The three v10 device logs distinguish transport from authenticated delivery:
Firefox had a connected WebRTC peer but no live entries; the phone reported
`GraffitiErrorCursorExpired: Cache out of sync - restart discovery` around
connection setup. The later desktop reload received the same phone broadcast.
The phone also still reported an unreadable outbox clock immediately after a
write. These observations do not establish the physical Safari cache bug's
cause. They do expose a recoverability requirement independent of that cause.

The first regression deliberately failed the binding lookup once. It failed on
the prior code: only one lookup occurred, leaving a connected peer permanently
unverified. Verification now retries while the peer remains connected. A bad
identity schema is rejected; live frames are never queued behind authentication.
Binding publication is lazy and retryable, and failed/late publications are
removed. Relay removal is idempotent across expiry, failure, and leave.

A second review found that dropping all pre-authentication frames needs mutual
readiness: otherwise the faster verifier can send the one-time codec catalog
before the other verifier is ready. A single `ready` message on the existing
transport acknowledges verification. The real Trystero test now delays one
side through an injected cache error and requires the one-time snapshot to
arrive without application resends. It passes. No custom connection manager,
full persistent replay, or media backlog was added.

Other removals/corrections from the successive passes:

- Storage-only discovery no longer builds a duplicate URL map. Live merging
  alone needs it, and that map remains capped.
- Explicit get refresh bypasses ephemeral tombstones and asks storage, matching
  the documented boundary.
- Removed an unused upload deadline from the local change journal and the
  wrapper's redundant direct Trystero dependency.
- Opus worker loading can recover after a failed fetch; a failed worker load
  releases its Blob URL. The existing polyfill test now fails the first fetch
  and then successfully publishes and plays audio.
- Stopping closes encoders immediately, even while accepted Graffiti work is
  finishing. Completed publishers clear their owned-URL sets and stopped
  players clear their receiver maps, so a retained handle does not retain them. A stalled frame-deletion path stops publication at 1,024 owned
  objects rather than retaining work for the entire call. A real Local test
  blocks deletion, observes posts stop, releases deletion, and checks failure
  and cleanup.

The final production pass rechecked API forwarding, permissions and actor
binding, outbox races and durability, ordinary versus live discovery cursors,
signaling lifetimes, transfer backpressure, MoQ groups/catalogs, stop/failure
paths, packaging, and the dependency boundaries. It found no further changes.
The persistent implementation still owns durable storage, replay, and caches;
none are cleared by realtime. Accepted writes after an abrupt crash can still
persist later. This preserves the draft post/flush contract.

Validation on this pass: all monorepo type checks; 307 Decentralized tests
(and the 21 outbox tests again after the journal-field removal), 61 Local,
61 realtime-wrapper unit/conformance, 24 signaling/room unit, one real Trystero
browser regression, six streaming/Local browser tests, 213 data-guard, 67 iframe
RPC, 59 synchronization, and seven runtime-type tests. Package dry-runs include
the streaming worker/WASM assets; changeset status includes both new packages
and the major API change. A sandboxed package dry-run initially could not write
npm's cache; using a temporary npm cache succeeded without changing permissions.

The complete cursor demo is 99 HTML lines, including UI, login, schemas,
post/delete/discovery, actorToHandle, and expiry. Its real-service browser check
passes from Chromium to Firefox, including usernames, movement, disappearance,
and reload/rejoin. The first check incorrectly selected every cursor after
reload, including the receiver's briefly still-valid previous-page cursor;
scoping the assertion to the sender and checking the old cursor's expiry fixed
the test, without changing application behavior.

The final synthetic WebKit-to-Firefox call used separate profiles, a completed
call followed by reload of both pages, and 150 ms per service request. The
60-second measurement passed every unchanged assertion:

| Measurement | Result |
| --- | --- |
| First video after sharing | 5.95 s, including signaling |
| Video rate | 14.7 decoded fps from a 15 fps source |
| Decoded frames | 3,000/3,004 audio; 882/883 video |
| Audio latency median / p95 | 140 / 148 ms |
| Video latency median / p95 | 174 / 206 ms |
| Measured audio silence | 0% |
| Media uploads | Zero audio or video; metadata/catalogs only |
| Pending outbox at 0 / 30 / 60 s | 234 / 249 / 253 |
| Live entries at 0 / 30 / 60 s | 537 / 553 / 558 |
| Local discovery journal | 1,024 entries |
| Worst post | 85 ms |

Report: `/tmp/graffiti-performance-v11-audit.json`. MoQ emits an additional
small duration-marker object at each video group boundary, so video object
count is not decoded-frame count; inspection found no repeated group/frame
pairs. The run still logs deleted-object 404s and MoQ's existing AudioNode
cleanup warning; there were no uncaught page errors. This is a synthetic
WebKit check, not a physical iPhone test or an hours-long heap measurement.
The earlier missing-clock stress failure remains documented above.

Both public demo responses were checked against the exact local v11 sources.
The public server was restarted in a persistent tool session after a detached
launch exited and briefly caused 502 responses; the existing HTTPS tunnel now
serves both routes successfully.

A final cleanup-only check after this measurement added the two explicit Map.clear
calls on completed publisher/player handles; the six Local streaming regressions
were rerun. The active media path and performance thresholds were unchanged.
