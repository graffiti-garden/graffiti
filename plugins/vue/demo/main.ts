import { createApp } from "vue";
import App from "./App.vue";
import { GraffitiPlugin } from "../src/plugin";
import { GraffitiPouchDB } from "@graffiti-garden/implementation-pouchdb";

// Horrible, I know
// this is just for testing
const one = "Sandbank8803";
const two = "hb#&6CQBx!ua%q";
const three = "tracker.graffiti.garden";
const four = "graffiti";

createApp(App)
  .use(GraffitiPlugin, {
    useGraffiti: () =>
      new GraffitiPouchDB({
        pouchDBOptions: {
          name: `https://${encodeURIComponent(one)}:${encodeURIComponent(two)}@${three}/${four}`,
        },
      }),
  })
  .mount("#app");
