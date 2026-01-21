import { createApp } from "vue";
import App from "./App.vue";
import { GraffitiPlugin } from "../../src/plugin";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";

createApp(App)
  .use(GraffitiPlugin, {
    graffiti: new GraffitiDecentralized(),
  })
  .mount("#app");
