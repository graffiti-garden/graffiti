import "@picocss/pico/css/pico.min.css";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { createApp } from "vue";
import FlowLab from "./FlowLab.vue";
import { graffiti, createGraffiti } from "./flow-lab-graffiti.js";

createApp(FlowLab, { auditUrl: graffiti.auditUrl(), createGraffiti })
  .use(GraffitiPlugin, { graffiti })
  .mount("#app");
window.addEventListener("pagehide", () => graffiti.destroy(), { once: true });
