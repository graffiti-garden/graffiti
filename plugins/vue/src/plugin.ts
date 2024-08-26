import type { App, Plugin } from "vue";
import { useGraffiti, useGraffitiSession } from "./session";
import SessionManager from "./SessionManager.vue";
import Discover from "./Discover.vue";
import type GraffitiClient from "@graffiti-garden/client-core";

declare module "vue" {
  export interface ComponentCustomProperties {
    $graffiti: GraffitiClient;
    $graffitiSession: ReturnType<typeof useGraffitiSession>;
  }

  export interface GlobalComponents {
    GraffitiSessionManager: typeof SessionManager;
    GraffitiDiscover: typeof Discover;
  }
}

const GraffitiPlugin: Plugin<Parameters<typeof useGraffiti>> = {
  install(app: App, ...args: Parameters<typeof useGraffiti>) {
    app.component("GraffitiSessionManager", SessionManager);
    app.component("GraffitiDiscover", Discover);
    app.config.globalProperties.$graffiti = useGraffiti(...args);
    app.config.globalProperties.$graffitiSession = useGraffitiSession();
  },
};
export default GraffitiPlugin;

export * from "@graffiti-garden/client-core";
export * from "./composables";
export * from "./session";
export {
  SessionManager as GraffitiSessionManager,
  Discover as GraffitiDiscover,
};
