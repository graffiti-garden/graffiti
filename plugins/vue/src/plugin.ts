import type { App, Plugin, Ref } from "vue";
import { ref } from "vue";
import Discover from "./Discover.vue";
import Get from "./Get.vue";
import RecoverOrphans from "./RecoverOrphans.vue";
import type {
  GraffitiFactory,
  Graffiti,
  GraffitiSession,
  GraffitiLoginEvent,
  GraffitiLogoutEvent,
  GraffitiSessionInitializedEvent,
} from "@graffiti-garden/api";
import { graffitiInjectKey, graffitiSessionInjectKey } from "./injections";
import type { Router } from "vue-router";

declare module "vue" {
  export interface ComponentCustomProperties {
    $graffiti: Graffiti;
    $graffitiSession: Ref<GraffitiSession | undefined | null>;
  }

  export interface GlobalComponents {
    GraffitiDiscover: typeof Discover;
    GraffitiGet: typeof Get;
    GraffitiRecoverOrphans: typeof RecoverOrphans;
  }
}

export interface GraffitiPluginOptions {
  useGraffiti: GraffitiFactory;
}

export const GraffitiPlugin: Plugin<GraffitiPluginOptions> = {
  install(app: App, options: GraffitiPluginOptions) {
    const graffiti = options.useGraffiti();
    const graffitiSession = ref<GraffitiSession | undefined | null>(undefined);
    graffiti.sessionEvents.addEventListener("initialized", async (evt) => {
      const detail = (evt as GraffitiSessionInitializedEvent).detail;

      if (detail && detail.error) {
        console.error(detail.error);
      }

      if (detail && detail.href) {
        // If we're using Vue Router, redirect to the URL after login
        const router = app.config.globalProperties.$router as
          | Router
          | undefined;
        if (router) {
          const url = new URL(detail.href);
          await router.replace(url.pathname + url.search + url.hash);
        }
      }

      // Set the session to "null" if the user is not logged in
      if (!graffitiSession.value) {
        graffitiSession.value = null;
      }
    });
    graffiti.sessionEvents.addEventListener("login", (evt) => {
      const detail = (evt as GraffitiLoginEvent).detail;
      if (detail.error) {
        console.error("Error logging in:");
        console.error(detail.error);
        return;
      } else {
        graffitiSession.value = detail.session;
      }
    });
    graffiti.sessionEvents.addEventListener("logout", (evt) => {
      const detail = (evt as GraffitiLogoutEvent).detail;
      if (detail.error) {
        console.error("Error logging out:");
        console.error(detail.error);
      } else {
        graffitiSession.value = null;
      }
    });

    app.provide(graffitiInjectKey, graffiti);
    app.provide(graffitiSessionInjectKey, graffitiSession);

    app.component("GraffitiDiscover", Discover);
    app.component("GraffitiGet", Get);
    app.component("GraffitiRecoverOrphans", RecoverOrphans);
    app.config.globalProperties.$graffiti = graffiti;
    app.config.globalProperties.$graffitiSession = graffitiSession;
  },
};

export * from "./composables";
export * from "./injections";
export { Discover as GraffitiDiscover };
export { Get as GraffitiGet };
export { RecoverOrphans as GraffitiRecoverOrphans };
