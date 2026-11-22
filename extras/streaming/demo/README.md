# Device demo

From the monorepo root, build the two demo dependencies once:

```sh
npm run build --workspace @graffiti-garden/implementation-decentralized
npm run build --workspace @graffiti-garden/wrapper-realtime
npm run demo --workspace @graffiti-garden/streaming
```

Open `http://localhost:52283/`. For another device, expose this server through an HTTPS tunnel; a plain LAN HTTP address cannot request camera/microphone access.

1. Copy the test link to the second device. Sign in to Graffiti on both. They may use the same account or different accounts.
2. Choose camera + microphone or microphone only, then Start sharing. You can share in both directions.
3. Remote streams initially play muted. Use Enable sound to hear them.
4. Try a late join and stop/restart. Use Stop sharing before closing a tab so its objects are removed.
5. If something fails, expand Diagnostics and Copy diagnostics. Version 11 retains restored-clock/read-back checks and live entry/room counts to outbox size, cache operations, lock wait/held phases, and whether held locks belong to this page or another page. It also records timer delays, FPS, audio progress, uploads, and connection candidate counts. Copied entries belong to the current page run. Media payloads, full SDP, and session credentials are not logged. Preview only skips encoding and publishing.

For the reload investigation, use Firefox on the computer and Safari on the
phone, on the same Wi-Fi. Close old demo tabs, but **do not clear site data**.
Open the same shared channel on both and verify **Diagnostics (v11)**. Once both
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
The complete application is [one 99-line HTML file](../../../wrappers/realtime/demo/index.html),
using ordinary post/delete/discovery and actorToHandle calls.

See [the performance notebook](../test/performance/NOTES.md) for measured results,
fault-injection runs, and the production audit. Synthetic browser tests do not
replace the physical iPhone check.
