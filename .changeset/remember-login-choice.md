---
"@graffiti-garden/wrapper-data-guard": patch
---

Offer saved accounts on the guard page when an embedding site needs cookie access, and preserve the chosen account on return without asking again. Disable account choices until their handles load.

Return cancellations and failed logins to updated clients with a request-specific URL marker, avoiding cookie setup just to report failure. Preserve the original app URL and caller state; older clients keep the cookie-based return.

Replace the connection alert with a nonblocking notice after 20 seconds, linking to the guard to check the connection. Remove the notice automatically when the guard responds.
