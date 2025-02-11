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
 * Be sure to use Graffiti from either this function or the global variable `$graffiti` in templates,
 * because they have been wrapped by the {@link GraffitiPlugin} with
 * [GraffitiSynchronize](https://sync.graffiti.garden/classes/GraffitiSynchronize.html)
 * to enable reactivity.
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
