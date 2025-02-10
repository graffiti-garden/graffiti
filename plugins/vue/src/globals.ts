import { inject } from "vue";
import type { InjectionKey, Ref } from "vue";
import type { Graffiti, GraffitiSession } from "@graffiti-garden/api";

export const graffitiInjectKey = Symbol() as InjectionKey<Graffiti>;
export const graffitiSessionInjectKey = Symbol() as InjectionKey<
  Ref<GraffitiSession | undefined | null>
>;

/**
 * Returns the global [Graffiti](https://api.graffiti.garden/classes/Graffiti.html) instance
 * passed into the plugin via {@link GraffitiPluginOptions.graffiti}.
 * @throws If the {@link GraffitiPlugin} is not installed
 */
export function useGraffiti() {
  const graffiti = inject(graffitiInjectKey);
  if (!graffiti) {
    throw new Error(
      "No Graffiti instance provided, did you forget to install the plugin?",
    );
  }
  return graffiti;
}

/**
 * Returns the global reactive [GraffitiSession](https://api.graffiti.garden/interfaces/GraffitiSession.html) instance.
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
