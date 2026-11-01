import "@picocss/pico/css/pico.min.css";
import { GraffitiRpcClient } from "@graffiti-garden/wrapper-iframe-rpc/client";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { createApp } from "vue";
import FlowLab from "./FlowLab.vue";

const parentOrigin = document.referrer
  ? new URL(document.referrer).origin
  : new URLSearchParams(window.location.search).get("parentOrigin");
if (!parentOrigin) throw new Error("Missing parent origin for nested flow lab.");
const graffiti = new GraffitiRpcClient({
  remoteWindow: window.parent,
  allowedOrigins: [parentOrigin],
});
createApp(FlowLab, { nested: true }).use(GraffitiPlugin, { graffiti }).mount("#app");
window.addEventListener("pagehide", () => graffiti.destroy(), { once: true });
