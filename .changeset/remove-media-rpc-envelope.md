---
"@graffiti-garden/wrapper-iframe-rpc": patch
"@graffiti-garden/wrapper-data-guard": patch
---

Remove the transitional getMedia envelope and return structured-cloned Blobs directly. Deploy hosts only after consumers support direct Blobs (iframe RPC 0.3.1), then update consumers to this release after hosts have migrated. File-only metadata remains local. Republish the data-guard browser bundle with the updated RPC client.
