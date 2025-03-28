import { createApp } from "vue";
import App from "./App.vue";
import { GraffitiPlugin } from "../../src/plugin";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";

createApp(App)
  .use(GraffitiPlugin, {
    graffiti: new GraffitiLocal(),
  })
  .mount("#app");
