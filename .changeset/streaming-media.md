---
"@graffiti-garden/streaming": minor
---

Add low-latency audio/video publishing and playback over ordinary Graffiti objects using MoQ's capture, codecs, and player. Forward frames immediately, support late joining and explicit cleanup, and test against Local without depending on a specific implementation.

Use MoQ's ordered reader to preserve audio through short write stalls and interleave expired-frame cleanup with fresh posts. Include two-page performance regressions against the decentralized test server, with audio-output continuity measurements.

Retain only the latest codec catalog on both ends, with bounded media history for long-running streams.

Recover from failed Opus worker loads, stop encoding promptly, and stop publication if cleanup cannot keep up. Include a two-device demo with versioned diagnostics.
