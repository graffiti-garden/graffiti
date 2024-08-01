import { createApp } from "vue";
import App from "./App.vue";
import GraffitiPlugin from "../src/plugin";

createApp(App).use(GraffitiPlugin).mount("#app");
