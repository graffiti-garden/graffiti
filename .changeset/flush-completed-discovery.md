---
"@graffiti-garden/wrapper-vue": patch
---

Flush pending discovery updates when a poll completes, while retaining the 50 ms batching window for streamed results. Dependent queries no longer wait for the remainder of that window, and canceled discoveries clear their pending update timer.
