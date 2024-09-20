import type { App, Plugin, Ref } from "vue";
import Discover from "./Discover.vue";
import GraffitiClient, {
  useGraffiti,
  type GraffitiPatch,
  type GraffitiSession,
} from "@graffiti-garden/client-core";
import { useGraffitiSession, registerSolidSession } from "./session";
import IdentityProviderLogin from "./IdentityProviderLogin.vue";

declare module "vue" {
  export interface ComponentCustomProperties {
    $graffiti: GraffitiClient;
    $graffitiSession: Ref<GraffitiSession>;
  }

  export interface GlobalComponents {
    GraffitiDiscover: typeof Discover;
  }
}

interface GraffitiPluginOptions {
  registerSolidSession?: boolean | Parameters<typeof registerSolidSession>[0];
}

const GraffitiPlugin: Plugin<GraffitiPluginOptions> = {
  install(app: App, options?: GraffitiPluginOptions) {
    if (options?.registerSolidSession !== false) {
      const registerOptions =
        typeof options?.registerSolidSession === "object"
          ? options?.registerSolidSession
          : {};
      registerSolidSession(registerOptions);
    }
    app.component("GraffitiDiscover", Discover);
    app.config.globalProperties.$graffiti = useGraffiti();
    app.config.globalProperties.$graffitiSession = useGraffitiSession();
  },
};
export default GraffitiPlugin;

export * from "@graffiti-garden/client-core";
export * from "./composables";
export * from "./session";
export { Discover as GraffitiDiscover };
export { IdentityProviderLogin as GraffitiIdentityProviderLogin };
