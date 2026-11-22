# Device demo

This integration demo needs the [Decentralized outbox](https://github.com/graffiti-garden/graffiti/pull/128) and [realtime wrapper](https://github.com/graffiti-garden/graffiti/pull/129) PRs in addition to this package. The streaming package itself builds and tests over Local without them. Use the combined checkout until those PRs land; the older experimental realtime package does not provide `GraffitiRealtime`.

From the monorepo root, build the demo dependencies once:

```sh
npm run build --workspace @graffiti-garden/implementation-decentralized
npm run build --workspace @graffiti-garden/realtime
npm run build:js:browser --workspace @graffiti-garden/wrapper-vue
npm run demo --workspace @graffiti-garden/streaming
```

Open `http://localhost:52283/`. For another device, expose this server through an HTTPS tunnel; a plain LAN HTTP address cannot request camera/microphone access.

1. Copy the test link to the second device. Sign in to Graffiti on both. They may use the same account or different accounts.
2. Choose camera + microphone or microphone only, then Start sharing. You can share in both directions.
3. Remote streams initially play muted. Use Enable sound to hear them.
4. Try a late join and stop/restart. Use Stop sharing before closing a tab so its objects are removed.
5. If something fails, expand Diagnostics and Copy diagnostics. Version 12 records error stacks and the first failure of each measured operation (including fetch, cache operations, and bucket uploads), with counts for repetitions. It also records restored-clock/read-back checks, outbox size, live entry/room counts, lock wait/held phases, which page holds locks, timer delays, FPS, audio progress, uploads, and connection candidate counts. Copied entries belong to the current page run. Request arguments, media payloads, full SDP, and session credentials are not logged. Preview only skips encoding and publishing.

If this origin still has data from the early experimental builds, close **all**
its demo tabs first, then clear this test site's data once. One v11 phone run
still had 68,379 old outbox records and another page holding its storage lock.
Clearing data while that page remains open does not release its lock. There is
no migration of experimental test data; later reload tests should retain data.

For the reload investigation, use Firefox on the computer and Safari on the
phone, on the same Wi-Fi. Close old demo tabs, but **do not clear site data**.
Open the same shared channel on both and verify **Diagnostics (v12)**. Once both
pages say “Listening for streams”, share from the phone only. Keep both pages
visible and the phone unlocked for 45 seconds; enable sound on the computer.
Stop sharing, wait ten seconds, then reload both pages without clearing data and
repeat. Copy diagnostics from both pages after the second attempt, even if it
works. If media has not appeared after 20 seconds, copy the logs then.

During a call, pending outbox and live entries should level off instead of growing
with the total frame count; live entries are capped at 1,024 per account. Actual
audio/video persistent-upload counts should stay at zero. After stopping, pending
frame records should drain. Listening still holds a live room, so its small
signaling records can remain until the page leaves.

This demo publishes public MoQ frame objects in a random channel. It uses Decentralized with a 5-second grace period and the realtime wrapper, without TURN. Network pairs that cannot connect directly will not reliably receive the short-lived frames through storage. MoQ's player uses a 120 ms jitter buffer; this is not a measurement of end-to-end network latency. Diagnostics show decoded frames and audio progress. The HTTP server serves the streaming and cursor demos and the three built browser packages, including Opus worker/WASM assets.
The cursor demo is at `http://localhost:52283/cursors/`. Copy its room link to
another device, sign in, and move or drag inside the box. Positions should
follow live with each account's username. Close one page: its cursor should
disappear within three seconds. Reload it and move again to check reconnection.
The complete application is [one 95-line HTML file](../../../wrappers/realtime/demo/index.html),
using ordinary post/delete calls, Vue discovery with `autopoll`, and
`<graffiti-actor-to-handle>`. Only publishing has a timer; the realtime wrapper
paces continuous discovery. This standalone demo serves the unreleased packages
and Vue locally; a Social.Wiki document gets its imports and routing from the runtime.

See [the performance notebook](../test/performance/NOTES.md) for measured results,
fault-injection runs, and the production audit. Synthetic browser tests do not
replace the physical iPhone check.
