import { GraffitiRpcClient } from "../client/index.js";
import { createGraffitiRelay, serveGraffiti } from "../host/index.js";

const graffiti = new GraffitiRpcClient({ remoteWindow: parent, channel: window.name });
for (const type of ["login", "logout", "initialized"]) graffiti.sessionEvents.addEventListener(type, event => {
  parent.postMessage({ type: "session-event", id: window.name, event: type, detail: (event as CustomEvent).detail }, "*");
});

const children = new Map<string, () => Promise<void>>();
window.addEventListener("message", async event => {
  if (event.source !== parent) {
    if (event.data?.type === "session-event") parent.postMessage(event.data, "*");
    return;
  }
  if (event.data?.type === "request") {
    if (event.data.method === "login") await graffiti.login({ state: event.data.state });
    else await graffiti.logout({ actor: "alice" }, { state: event.data.state });
  } else if (event.data?.type === "mount") {
    const id = event.data.id as string;
    const relay = createGraffitiRelay(graffiti, id);
    const host = serveGraffiti(relay.graffiti);
    const frame = document.createElement("iframe");
    frame.name = id;
    frame.srcdoc = `<script type="module" src=${JSON.stringify(import.meta.url)}></script>`;
    document.body.append(frame);
    host.connect({ remoteWindow: frame.contentWindow!, channel: id, stateId: relay.stateId });
    children.set(id, async () => {
      relay.destroy();
      await host.destroy(); frame.remove();
    });
  } else if (event.data?.type === "unmount") {
    await children.get(event.data.id)?.();
    children.delete(event.data.id);
    parent.postMessage({ type: "removed", id: event.data.id }, "*");
  } else if (event.data?.type === "child-request") {
    const frame = [...document.querySelectorAll("iframe")].find(frame => frame.name === event.data.id);
    frame?.contentWindow?.postMessage({ type: "request", method: event.data.method, state: event.data.state }, "*");
  }
});
