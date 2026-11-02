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
import { LoginAccess } from "./core/login-access.js";
import { sourceFromContext } from "./core/source.js";
import { activateStorageAccess, restoreStorageAccess, getLocalStorage } from "./bootstrap/storage_access.js";
import { GuardedGraffiti } from "./core/graffiti.js";
import { Guard } from "./core/guard.js";
import { GraffitiRuleStore } from "./core/rules.js";
import App from "./ui/App.vue";
import { ask } from "./ui/ask.js";
import { trackAuditSessions } from "./ui/audit.js";

const standalone = window.parent === window;
// Embedded guard pages need a transparent canvas; standalone pages do not.
if (standalone) document.documentElement.classList.add("standalone");

const ruleStore = new GraffitiRuleStore(sourceFromContext(window.location.origin, {}));
const app = createApp(App, { ruleStore });
// The login-return prompt uses this root before the Graffiti plugin is installed.
app.mount("#app");
const pageUrl = new URL(window.location.href);

if (standalone) {
  if (isStorageSetup(pageUrl)) {
    handleStorageSetup(pageUrl);
  } else {
    let auditSessions: ReturnType<typeof trackAuditSessions>;
    handleLoginRedirect(
      pageUrl,
      () => {
        const graffiti = new GraffitiDecentralized({ replaceInitialLoginHistoryEntry: true });
        auditSessions = trackAuditSessions(graffiti);
        // Subscribe the UI before initialization can restore existing sessions.
        app.use(GraffitiPlugin, { graffiti });
        return graffiti;
      },
      () => {
        ruleStore.activate();
        handleAudit(pageUrl, auditSessions);
      },
    );
  }
} else {
  listenToParent(async (origin, loginNonce, loginCancelled) => {
    let cookieAccess = await restoreStorageAccess();
    if (!cookieAccess && !loginCancelled && loginNonce) {
      cookieAccess = await activateStorageAccess();
    }
    // The implementation restores its own saved credentials. Site approval stays
    // in this embedding site's storage and does not require shared cookies.
    const graffiti = new GraffitiDecentralized();
    app.use(GraffitiPlugin, { graffiti });
    ruleStore.activate();
    const access = new LoginAccess(getLocalStorage());
    const guard = new Guard(graffiti, ruleStore, origin, ask, access);
    // This untrusted return can only report failure. Success still requires the
    // guard's origin-bound cookie, and neither identity nor consent comes from a URL.
    const result = loginCancelled
      ? { error: new Error("Login was not completed"), state: loginCancelled.state }
      : cookieAccess && loginNonce ? takeLoginResult(loginNonce, origin) : undefined;
    const guarded = new GuardedGraffiti(graffiti, guard, access, origin, result);
    serveGraffiti(guarded).connect({
      remoteWindow: window.parent,
      allowedOrigins: [origin],
      stateId: origin,
    });
  });
}
