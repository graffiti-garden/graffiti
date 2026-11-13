---
"@graffiti-garden/wrapper-iframe-rpc": patch
---

Pass immutable media Blobs through iframe RPC without reading a new ArrayBuffer at every hop. Keep the existing media envelope while consuming bundles update; the client also accepts a direct Blob so the envelope can be removed in a later coordinated cleanup.
