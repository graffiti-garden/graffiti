import type { App, Plugin, Ref } from "vue";
import { ref } from "vue";
import Discover from "./Discover.vue";
import Get from "./Get.vue";
import RecoverOrphans from "./RecoverOrphans.vue";
import type {
  Graffiti,
  GraffitiSession,
  GraffitiLoginEvent,
  GraffitiLogoutEvent,
  GraffitiSessionInitializedEvent,
} from "@graffiti-garden/api";
import { graffitiInjectKey, graffitiSessionInjectKey } from "./globals";
import type { Router } from "vue-router";
import { GraffitiSynchronize } from "@graffiti-garden/wrapper-synchronize";

declare module "vue" {
  export interface ComponentCustomProperties {
    /**
     * Global [Graffiti](https://api.graffiti.garden/classes/Graffiti.html) instance.
     *
     * In the [composition API](https://vuejs.org/guide/introduction.html#composition-api)
     * use {@link useGraffiti} instead.
     *
     * This is the same Graffiti registered with the {@link GraffitiPlugin}
     * via {@link GraffitiPluginOptions.graffiti}, only it has been wrapped
     * with [GraffitiSynchronize](https://sync.graffiti.garden/classes/GraffitiSynchronize.html).
     * Be sure to use the wrapped instance to enable reactivity.
     */
    $graffiti: Graffiti;
    /**
     * Global reactive [GraffitiSession](https://api.graffiti.garden/classes/GraffitiSession.html) instance
     * as a [Vue ref](https://vuejs.org/api/reactivity-core.html#ref).
     *
     * In the [composition API](https://vuejs.org/guide/introduction.html#composition-api)
     * use {@link useGraffitiSession} instead.
     *
     * While the application is loading and restoring any previous sessions,
     * the value will be `undefined`. If the user is not logged in,
     * the value will be `null`.
     *
     * This only keeps track of one session. If your app needs
     * to support multiple login sessions, you'll need to manage them
     * yourself using [`Graffiti.sessionEvents`](https://api.graffiti.garden/classes/Graffiti.html#sessionevents).
     */
    $graffitiSession: Ref<GraffitiSession | undefined | null>;
  }

  export interface GlobalComponents {
    GraffitiDiscover: typeof Discover;
    GraffitiGet: typeof Get;
    GraffitiRecoverOrphans: typeof RecoverOrphans;
  }
}
export type { ComponentCustomProperties } from "vue";

/**
 * Options for the {@link GraffitiPlugin}.
 */
export interface GraffitiPluginOptions {
  /**
   * An instance of the [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html)
   * for the Vue.js plugin to use.
   * This instance, wrapped with [GraffitiSynchronize](https://sync.graffiti.garden/classes/GraffitiSynchronize.html),
   * will be exposed in Vue templates as {@link ComponentCustomProperties.$graffiti | $graffiti}
   * and in setup functions as {@link useGraffiti}.
   * You must interact with Graffiti through these wrapped instances
   * to enable reactivity.
   *
   * You'll likely want to use the [federated implementation](https://github.com/graffiti-garden/implementation-federated).
   * However, you could also use the [local implementation](https://github.com/graffiti-garden/implementation-local)
   * for testing. Other implementations may be available in the future.
   */
  graffiti: Graffiti;
}

/**
 * A [Vue.js](https://vuejs.org/) plugin that wraps around
 * the [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html)
 * to provide [reactive](https://en.wikipedia.org/wiki/Reactive_programming) versions
 * of various Graffiti API methods.
 *
 * These reactive methods are available as both
 * [renderless components](https://vuejs.org/guide/components/slots#renderless-components),
 * which make it possible to create a whole Graffiti app in an HTML template,
 * and [composables](https://vuejs.org/guide/reusability/composables.html),
 * which can be used in the programmatic [composition API](https://vuejs.org/guide/extras/composition-api-faq.html).
 *
 * | [API](https://api.graffiti.garden/classes/Graffiti.html) method | [Composable](https://vuejs.org/guide/reusability/composables.html) | [Component](https://vuejs.org/guide/components/slots#renderless-components) |
 * | --- | --- | --- |
 * | [discover](https://api.graffiti.garden/classes/Graffiti.html#discover) | {@link useGraffitiDiscover} | {@link GraffitiDiscover} |
 * | [get](https://api.graffiti.garden/classes/Graffiti.html#get) | {@link useGraffitiGet} | {@link GraffitiGet} |
 * | [recoverOrphans](https://api.graffiti.garden/classes/Graffiti.html#recoverorphans) | {@link useGraffitiRecoverOrphans} | {@link GraffitiRecoverOrphans} |
 *
 * The plugin also exposes a global [Graffiti](https://api.graffiti.garden/classes/Graffiti.html) instance
 * and keeps track of the global [GraffitiSession](https://api.graffiti.garden/interfaces/GraffitiSession.html)
 * state as a reactive variable.
 * They are available in templates as global variables or in setup functions as
 * composable functions.
 *
 * | Global variabale | [Composable](https://vuejs.org/guide/reusability/composables.html) |
 * | --- | --- |
 * | {@link ComponentCustomProperties.$graffiti | $graffiti } | {@link useGraffiti} |
 * | {@link ComponentCustomProperties.$graffitiSession | $graffitiSession } | {@link useGraffitiSession} |
 *
 * [See the README for installation instructions](/).
 *
 * You can find live examples [here](/examples/), but basic usage looks like this:
 *
 * ```ts
 * import { createApp } from "vue";
 * import { GraffitiPlugin } from "@graffiti-garden/vue";
 * import { GraffitiLocal } from "@graffiti-garden/implementation-local";
 * import App from "./App.vue";
 *
 * createApp(App)
 *   .use(GraffitiPlugin, {
 *     graffiti: new GraffitiLocal(),
 *   })
 * ```
 *
 * ```vue
 * <!-- App.vue -->
 * <template>
 *   <button
 *     v-if="$graffitiSession.value"
 *     @click="$graffiti.put({
 *       value: { content: 'Hello, world!' },
 *       channels: [ 'my-channel' ]
 *     }, $graffitiSession.value)"
 *   >
 *     Say Hello
 *   </button>
 *   <button v-else @click="$graffiti.login()">
 *     Log In to Say Hello
 *   </button>
 *
 *   <GraffitiDiscover
 *     v-slot="{ results }"
 *     :channels="[ 'my-channel' ]"
 *     :schema="{
 *       properties: {
 *         value: {
 *           required: ['content'],
 *           properties: {
 *             content: { type: 'string' }
 *           }
 *         }
 *       }
 *     }"
 *   >
 *     <ul>
 *       <li
 *         v-for="result in results"
 *         :key="$graffiti.objectToUri(result)"
 *       >
 *         {{ result.value.content }}
 *       </li>
 *     </ul>
 *   </GraffitiDiscover>
 * </template>
 * ```
 */
export const GraffitiPlugin: Plugin<GraffitiPluginOptions> = {
  install(app: App, options: GraffitiPluginOptions) {
    const graffitiBase = options.graffiti;
    const graffiti = new GraffitiSynchronize(graffitiBase);

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
export {
  useGraffiti,
  useGraffitiSynchronize,
  useGraffitiSession,
} from "./globals";
export { Discover as GraffitiDiscover };
export { Get as GraffitiGet };
export { RecoverOrphans as GraffitiRecoverOrphans };
