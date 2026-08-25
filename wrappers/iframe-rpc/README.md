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
