---
"@graffiti-garden/implementation-decentralized": patch
---

Await the author's personal and shared inbox pins before publishing objects or media. Failed required sends or pins trigger best-effort cleanup of pins and uploaded data. Sending to other actors' personal inboxes remains unauthenticated and best effort. Requires inbox servers with pin/unpin support; the public Graffiti API is unchanged.
