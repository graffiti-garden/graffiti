import "@picocss/pico/css/pico.min.css";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";
import { graffiti } from "./graffiti.js";

createApp(App).use(GraffitiPlugin, { graffiti }).mount("#app");
window.addEventListener("pagehide", () => graffiti.destroy(), { once: true });
