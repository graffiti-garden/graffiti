import type { App } from "vue";
import { useGraffitiClient, useSessionInfo } from "./session";
import SessionManager from "./SessionManager.vue";
import Query from "./Query.vue";
import type GraffitiClient from "@graffiti-garden/client-core";

declare module "vue" {
  export interface ComponentCustomProperties {
    $graffiti: GraffitiClient;
    $graffitiSessionInfo: ReturnType<typeof useSessionInfo>;
  }

  export interface GlobalComponents {
    GraffitiSessionManager: typeof SessionManager;
    GraffitiQuery: typeof Query;
  }
}

const GraffitiPlugin = {
  install(app: App) {
    app.component("GraffitiSessionManager", SessionManager);
    app.component("GraffitiQuery", Query);
    app.config.globalProperties.$graffiti = useGraffitiClient();
    app.config.globalProperties.$graffitiSessionInfo = useSessionInfo();
  },
};
export default GraffitiPlugin;

export * from "./composables";
export * from "./session";
export { SessionManager as GraffitiSessionManager, Query as GraffitiQuery };
