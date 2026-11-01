# Graffiti iframe RPC

A host/client pair for passing any Graffiti implementation across an
iframe boundary.

```ts
// Window that already has a Graffiti implementation
import { serveGraffiti } from "@graffiti-garden/wrapper-iframe-rpc/host";

const host = serveGraffiti(graffiti);
const connection = host.connect({
  remoteWindow: iframe.contentWindow!,
});

// Disconnect this iframe.
await connection.destroy();

// Disconnect every iframe and stop serving Graffiti.
await host.destroy();
```

```ts
// Window that needs Graffiti
import { GraffitiRpcClient } from "@graffiti-garden/wrapper-iframe-rpc/client";

const graffiti = new GraffitiRpcClient({ remoteWindow: window.parent });

// Disconnect from the host.
graffiti.destroy();
```

Repeated construction in the same JavaScript realm returns this same client,
so there is only one RPC connection and one remote initialization. Active
`login` events and the `initialized` event are replayed locally after each
subsequent construction.

When relaying to nested frames, give each child a stable `stateId` so login and
logout replies can find the same child after a redirect reloads the page:

```ts
import { createGraffitiRelay, serveGraffiti } from "@graffiti-garden/wrapper-iframe-rpc/host";

const relay = createGraffitiRelay(graffiti, "chat-document-123");
const host = serveGraffiti(relay.graffiti);
const connection = host.connect({
  remoteWindow: iframe.contentWindow!,
  stateId: relay.stateId,
});

// When removing the child:
relay.destroy();
await host.destroy();
```

The ID must be unique among the containing page's children and reused for that
child after reload. RPC prefixes the caller's `state` on each outgoing request
and removes its prefix from the reply. No Graffiti implementation needs to parse it.

The RPC client holds replies for children that have not been created yet. A relay
delivers only its child's pending replies, once, followed by current sessions.
It does not replay request results to existing listeners on the parent instance.
Ordinary session restoration still has no request `state`.
