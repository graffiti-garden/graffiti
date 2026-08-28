import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { serveGraffiti } from "../host/index.js";

try {
  const host = serveGraffiti(new GraffitiLocal());
  host.connect({ remoteWindow: window.parent });
  window.parent.postMessage("graffiti-rpc-test-host-ready", location.origin);
} catch (error) {
  window.parent.postMessage(
    { graffitiRpcTestHostError: String(error) },
    location.origin,
  );
}
