import type { App, Plugin } from "vue";
import Discover from "./Discover.vue";
import GraffitiClient from "@graffiti-garden/client-core";
import useGraffiti from "./use-graffiti";

declare module "vue" {
  export interface ComponentCustomProperties {
    $graffiti: GraffitiClient;
  }

  export interface GlobalComponents {
    GraffitiDiscover: typeof Discover;
  }
}

const GraffitiPlugin: Plugin<Parameters<typeof useGraffiti>> = {
  install(app: App, ...args: Parameters<typeof useGraffiti>) {
    app.component("GraffitiDiscover", Discover);
    app.config.globalProperties.$graffiti = useGraffiti(...args);
  },
};
export default GraffitiPlugin;

export { useGraffiti };
export * from "@graffiti-garden/client-core";
export * from "./composables";
export { Discover as GraffitiDiscover };
