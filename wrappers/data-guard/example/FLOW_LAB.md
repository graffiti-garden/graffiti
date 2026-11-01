# Data guard flow lab

From the Graffiti repository root, run:

```sh
npm run dev:flow-lab -w graffiti-wrapper-data-guard-example
```

This builds the changed iframe RPC, decentralized, and guard client packages, then starts the guard at `https://localhost:5184/` and two copies of the lab at `https://localhost:5183/flow-lab.html` (site A) and `https://localhost:5185/flow-lab.html` (site B). Open the guard URL directly first and accept its local development certificate. Accept the certificate for each app URL too, then open A and B in separate tabs in the same browser profile. Keep the terminal running while testing.

The lab adds a `?lab=...` value to its URL. Use its “Open Site B” link to carry that value to the other site so both tabs discover the same test channel. The host uses the real decentralized implementation and your signed-in account. Posts, uploads, and deletions affect real account data. Use a test account and disposable items. The two app ports have different browser origins and therefore different guard site IDs, despite showing the same app.

## Flow checklist

- **Identity:** Log in on A. A fresh sign-in redirects through the existing account screen and returns to A. Open B and log in with the already signed-in actor; the guard asks in a dialog over B whether it may use that identity. Refresh each tab to check that its login grant remains available for the current sign-in.
- **Ordinary post:** Post a public item on A. There should be no publishing prompt. Inspect its `value["via site"]` stamp and delete it on A without another prompt.
- **Confirmation:** Post an item with `value["confirm with guard"] = true`. The guard should show the proposed data, channels, and visibility before posting. Approval applies to this one post; a later confirmed post asks again.
- **Private read:** Post a private item on A (`allowed: []`). Reading it on A needs no data prompt. Reading the same item on B asks before revealing it. Approve without “Remember,” read it again in that page session, then refresh B to check that the item-only choice was cleared. “Remember” grants B future private reads of items made through A.
- **Cross-site delete:** Delete an A-created item from B. The guard asks for separate deletion approval, even if B has a read grant. Try both one-item approval and “Remember”; deletion from A needs no cross-site approval.
- **Media:** Upload a private file on A. Reading it from B asks for approval, and deleting it from B asks separately. Provenance is stored in the file's MIME type; URLs and file bytes are unchanged. Knowing the URL alone does not grant private access. Older files without provenance follow the unknown-origin rule and do not prompt.
- **Audit and logout:** Open the guard audit view to inspect remembered decisions. Log out and check that the site's identity grant is gone; a later sign-in starts a new grant period.
- **Nested site:** On A, open the child frame. Log in and post a private item inside it. The parent should gain the account session and be able to read and delete that item without an extra prompt. Logging in to the parent alone should not log in the child. Repeat on B to see that each parent has its own site ID.

Use fresh items when testing remembered choices, since earlier grants can suppress the prompts you intend to inspect.

The child frame is served from the other app port, but its parent assigns its site ID and forwards its requests through the parent's guard connection. Both app ports need their certificates accepted before testing the child frame.
