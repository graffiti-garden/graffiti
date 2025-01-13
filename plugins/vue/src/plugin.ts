import type { App, Plugin, Ref } from "vue";
import { ref } from "vue";
import Discover from "./Discover.vue";
import type {
  GraffitiFactory,
  Graffiti,
  GraffitiSession,
  GraffitiLoginEvent,
  GraffitiLogoutEvent,
} from "@graffiti-garden/api";
import { graffitiInjectKey, graffitiSessionInjectKey } from "./injections";

declare module "vue" {
  export interface ComponentCustomProperties {
    $graffiti: Graffiti;
    $graffitiSession: Ref<GraffitiSession | undefined>;
  }

  export interface GlobalComponents {
    GraffitiDiscover: typeof Discover;
  }
}

export interface GraffitiPluginOptions {
  useGraffiti: GraffitiFactory;
}

export const GraffitiPlugin: Plugin<GraffitiPluginOptions> = {
  install(app: App, options: GraffitiPluginOptions) {
    const graffiti = options.useGraffiti();
    const graffitiSession = ref<GraffitiSession | undefined>(undefined);
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
        graffitiSession.value = undefined;
      }
    });

    app.provide(graffitiInjectKey, graffiti);
    app.provide(graffitiSessionInjectKey, graffitiSession);

    app.component("GraffitiDiscover", Discover);
    app.config.globalProperties.$graffiti = graffiti;
    app.config.globalProperties.$graffitiSession = graffitiSession;
  },
};

export * from "./composables";
export * from "./injections";
export { Discover as GraffitiDiscover };
