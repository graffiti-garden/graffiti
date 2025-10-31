import { createApp } from "vue";
import App from "./App.vue";
import "@picocss/pico/css/pico.classless.fuchsia.css";

createApp(App)
  .directive("focus", { mounted: (e) => e.focus() })
  .mount("#app");
