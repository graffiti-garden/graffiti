import { inject } from "vue";
import type { InjectionKey, Ref } from "vue";
import type { Graffiti, GraffitiSession } from "@graffiti-garden/api";
import type { GraffitiSynchronize } from "@graffiti-garden/wrapper-synchronize";

export const graffitiInjectKey = Symbol() as InjectionKey<GraffitiSynchronize>;
export const graffitiSessionInjectKey = Symbol() as InjectionKey<
  Ref<GraffitiSession | undefined | null>
>;

/**
 * Returns the global [Graffiti](https://api.graffiti.garden/classes/Graffiti.html) instance
 * that has been wrapped by the {@link GraffitiPlugin} with the [GraffitiSynchronize](https://sync.graffiti.garden/classes/GraffitiSynchronize.html).
 * @throws If the {@link GraffitiPlugin} is not installed
 */
export function useGraffitiSynchronize() {
  const graffiti = inject(graffitiInjectKey);
  if (!graffiti) {
    throw new Error(
      "No Graffiti instance provided, did you forget to install the plugin?",
    );
  }
  return graffiti;
}

/**
 * Returns the global [Graffiti](https://api.graffiti.garden/classes/Graffiti.html) instance.
 *
 * In Vue templates and the [options API](https://vuejs.org/guide/introduction.html#options-api)
 * use the global variable {@link ComponentCustomProperties.$graffiti | $graffiti} instead.
 *
 * This is the same Graffiti registered with the {@link GraffitiPlugin}
 * via {@link GraffitiPluginOptions.graffiti}, only it has been wrapped
 * with [GraffitiSynchronize](https://sync.graffiti.garden/classes/GraffitiSynchronize.html).
 * Be sure to use the wrapped instance to enable reactivity.
 *
 * @throws If the {@link GraffitiPlugin} is not installed
 */
export function useGraffiti(): Graffiti {
  return useGraffitiSynchronize();
}

/**
 * Returns a global reactive [GraffitiSession](https://api.graffiti.garden/interfaces/GraffitiSession.html) instance
 * as a [Vue ref](https://vuejs.org/api/reactivity-core.html#ref).
 *
 * In Vue templates and the [options API](https://vuejs.org/guide/introduction.html#options-api)
 * use the global variable {@link ComponentCustomProperties.$graffitiSession | $graffitiSession} instead.
 *
 * While the application is loading and restoring any previous sessions,
 * the value will be `undefined`. If the user is not logged in,
 * the value will be `null`.
 *
 * This only keeps track of one session. If your app needs
 * to support multiple login sessions, you'll need to manage them
 * yourself using [`Graffiti.sessionEvents`](https://api.graffiti.garden/classes/Graffiti.html#sessionevents).
 * @throws If the {@link GraffitiPlugin} is not installed
 */
export function useGraffitiSession() {
  const session = inject(graffitiSessionInjectKey);
  if (!session) {
    throw new Error(
      "No Graffiti session provided, did you forget to install the plugin?",
    );
  }
  return session;
}
