---
"@graffiti-garden/implementation-decentralized": patch
---

Automatically pin validated personal-inbox messages in batches. Fresh pin-status hints avoid redundant requests without being cached. Failed pins are reported without hiding verified objects and retried on later discoveries using the existing capped backoff. Shared-inbox readers do not sponsor other authors' messages. Older discovery cursors expire; the public Graffiti API is unchanged.
