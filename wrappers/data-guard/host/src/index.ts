import { serveGraffiti } from "@graffiti-garden/wrapper-iframe-rpc/host";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { createApp } from "vue";
import { handleAudit } from "./bootstrap/audit.js";
import {
  handleLoginRedirect,
  takeLoginResult,
} from "./bootstrap/login_redirect.js";
import { listenToParent } from "./bootstrap/protocol.js";
import {
  handleStorageSetup,
  isStorageSetup,
} from "./bootstrap/storage_setup.js";
import { activateStorageAccess } from "./bootstrap/storage_access.js";
import { GuardDB } from "./core/db.js";
import { GuardedGraffiti } from "./core/graffiti.js";
import { Guard } from "./core/guard.js";
import { GraffitiRuleStore } from "./core/rules.js";
import App from "./ui/App.vue";
import { ask } from "./ui/ask.js";

const standalone = window.parent === window;
// Embedded guard pages need a transparent canvas; standalone pages do not.
if (standalone) document.documentElement.classList.add("standalone");

const ruleStore = new GraffitiRuleStore();
const app = createApp(App, { ruleStore });
// The storage-access prompt uses this root before Graffiti can safely touch
// browser storage. Graffiti-dependent prompt components are rendered only after
// the plugin is installed below.
app.mount("#app");
const pageUrl = new URL(window.location.href);

if (standalone) {
  if (isStorageSetup(pageUrl)) {
    handleStorageSetup(pageUrl);
  } else {
    handleLoginRedirect(
      pageUrl,
      () => {
        const graffiti = new GraffitiDecentralized({ replaceInitialLoginHistoryEntry: true });
        // Subscribe the UI before initialization can restore existing sessions.
        app.use(GraffitiPlugin, { graffiti });
        return graffiti;
      },
      () => {
        ruleStore.activate();
        handleAudit(pageUrl);
      },
    );
  }
} else {
  listenToParent((origin, pageUrl, loginNonce) => {
    activateStorageAccess(pageUrl).then(() => {
      const graffiti = new GraffitiDecentralized();
      app.use(GraffitiPlugin, { graffiti });
      ruleStore.activate();
      const guard = new Guard(graffiti, new GuardDB(ruleStore), origin, ask);
      serveGraffiti(new GuardedGraffiti(graffiti, guard)).connect({
        remoteWindow: window.parent,
        allowedOrigins: [origin],
        initialLoginResult: () => loginNonce ? takeLoginResult(loginNonce, origin) : undefined,
      });
    });
  });
}
