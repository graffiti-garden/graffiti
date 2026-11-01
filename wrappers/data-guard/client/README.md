# Graffiti Data Guard

Ask before a site accesses authenticated Graffiti data.

```ts
import { GraffitiGuarded } from "@graffiti-garden/wrapper-data-guard";

const graffiti = new GraffitiGuarded({
  // This is the default host if one is not specified
  hostUrl: "https://guard.graffiti.garden/",
});

// Get session through graffiti.login as normal...

// Use graffiti actions as normal, they will all invoke the guard
await graffiti.post({
  value: { content: 'Hello world!'},
  channels: ['my-channel'],
}, session);

// Link to the audit page for this part of the app.
const auditLink = document.createElement("a");
auditLink.href = graffiti.auditUrl({ actor: session.actor });
auditLink.textContent = "Review data permissions";

// Destroy the GraffitiGuarded instance if you no longer need it.
graffiti.destroy();
```

For nested apps, wrap the parent's Graffiti instance before exposing it to a
child. The parent supplies the child's ID, display name, and optional URL:

```ts
import { withGuardSource } from "@graffiti-garden/wrapper-data-guard";
import { createGraffitiRelay, serveGraffiti } from "@graffiti-garden/wrapper-iframe-rpc/host";

const relay = createGraffitiRelay(graffiti, "document-123");
const child = withGuardSource(relay.graffiti, () => ({
  id: "document-123", name: "Example Document", url: "https://example.com/document",
}));
const host = serveGraffiti(child.graffiti);
const connection = host.connect({
  remoteWindow: iframe.contentWindow!, stateId: relay.stateId,
});

// When removing the child:
child.destroy();
relay.destroy();
await connection.destroy();
await host.destroy();
```

The wrapper prefixes the child's `source` on login options and authenticated
calls. It filters session events so login to one child reaches its ancestors,
without exposing an identity to siblings. Each level uses the same wrapper.
Logout offers this site or all sites on the device. This-site logout includes
nested sites, while parents and siblings remain signed in. All-sites logout
ends that identity's session; other identities are unaffected.
Returning `undefined` from the source callback deliberately shares the parent's
scope. The RPC relay supplies session restoration and pending request results
even when the child appears later. Reuse its `stateId` after reload so a login
redirect can return the caller's `state` to the same child.

To expose a synchronous site ID, use the shared encoder with the full path:
the embedding browser origin followed by each parent-assigned site ID.

```ts
import { encodeGuardSiteId } from "@graffiti-garden/wrapper-data-guard";

const id = encodeGuardSiteId(["https://example.com", "document-123"]);
```

Pass this string to the child during startup. It matches `value["via site"].id`
for that scope; inherited scopes reuse the parent's path. Names and URLs do not
affect the ID. This exposes identity only, without granting permissions.

These are guard conventions, not additional Graffiti API requirements. The
guard supplies `guardSites` on sessions to describe approved descendant paths
using IDs only. Nesting wrappers trim that information before forwarding it.
It is used for event filtering, never as proof of authorization: the guard
checks its own saved grants for every authenticated call. RPC transports the
ordinary calls and events without interpreting these fields.
