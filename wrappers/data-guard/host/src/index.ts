import { serveGraffiti } from "@graffiti-garden/wrapper-iframe-rpc/host";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { createApp } from "vue";
import { handleAudit } from "./bootstrap/audit.js";
import {
  handleLoginRedirect,
  isLoginRedirect,
} from "./bootstrap/login_redirect.js";
import { listenToParent } from "./bootstrap/protocol.js";
import { activateStorageAccess } from "./bootstrap/storage_access.js";
import { GuardDB } from "./core/db.js";
import { GuardedGraffiti } from "./core/graffiti.js";
import { Guard } from "./core/guard.js";
import App from "./ui/App.vue";
import { ask } from "./ui/ask.js";

const app = createApp(App);
// The storage-access prompt uses this root before Graffiti can safely touch
// browser storage. Graffiti-dependent prompt components are rendered only after
// the plugin is installed below.
app.mount("#app");
const pageUrl = new URL(window.location.href);

if (window.parent === window) {
  if (isLoginRedirect(pageUrl)) {
    void handleLoginRedirect(pageUrl);
  } else {
    handleAudit(pageUrl);
  }
} else {
  listenToParent((origin) => {
    activateStorageAccess().then(() => {
      const graffiti = new GraffitiDecentralized();
      app.use(GraffitiPlugin, { graffiti });
      const guard = new Guard(graffiti, new GuardDB(), origin, ask);
      serveGraffiti(new GuardedGraffiti(graffiti, guard)).connect({
        remoteWindow: window.parent,
        allowedOrigins: [origin],
      });
    });
  });
}
