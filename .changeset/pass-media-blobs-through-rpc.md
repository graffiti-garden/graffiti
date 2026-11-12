---
"@graffiti-garden/wrapper-iframe-rpc": patch
---

Pass immutable media Blobs through iframe RPC without reading a new ArrayBuffer at every hop. Preserve the existing media envelope so older clients and hosts remain compatible.
