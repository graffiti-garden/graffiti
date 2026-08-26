# Graffiti Guard

Ask before a site accesses authenticated Graffiti data.

```ts
import { GraffitiGuarded } from "@graffiti-garden/wrapper-guard";

const graffiti = new GraffitiGuarded({
  // This is the default host if one is not specified
  hostUrl: "https://guard.graffiti.garden/",
});

// Get session through graffiti.login as normal...

// If the site has internal structure, permissions can
// be granted to specific sub-resources if provided with
// an ID and name (or multiple for nested resources).
const documentSession = {
  ...session,
  source: [
    { id: "document-123", name: "Example Document" },
  ],
};

// Use graffiti actions as normal, they will all invoke the guard
await graffiti.post({
  value: { content: 'Hello world!'},
  channels: ['my-channel'],
}, documentSession);

// Open the audit page to investigate the action history and granted permissions
graffiti.audit(documentSession);

// Destroy the GraffitiGuarded instance if you no longer need it.
graffiti.destroy();
```
