import { createApp } from "vue";
import App from "./App.vue";
import { GraffitiPlugin } from "../src/plugin";
import { GraffitiPouchDB } from "@graffiti-garden/implementation-pouchdb";

createApp(App)
  .use(GraffitiPlugin, {
    useGraffiti: () => new GraffitiPouchDB(),
  })
  .mount("#app");
