import { createApp } from "vue";
import Home from "./Home.vue";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";
import PrimeVue from "primevue/config";

createApp(Home)
  .use(PrimeVue)
  .use(GraffitiPlugin, { graffiti: new GraffitiDecentralized() })
  .mount("#app");
