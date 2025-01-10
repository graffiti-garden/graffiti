import { inject } from "vue";
import type { InjectionKey, Ref } from "vue";
import type { Graffiti, GraffitiSession } from "@graffiti-garden/api";

export const graffitiInjectKey = Symbol() as InjectionKey<Graffiti>;
export const graffitiSessionInjectKey = Symbol() as InjectionKey<
  Ref<GraffitiSession | undefined>
>;

export function useGraffiti() {
  const graffiti = inject(graffitiInjectKey);
  if (!graffiti) {
    throw new Error("No Graffiti instance provided");
  }
  return graffiti;
}

export function useGraffitiSession() {
  const session = inject(graffitiSessionInjectKey);
  if (!session) {
    throw new Error("No Graffiti session provided");
  }
  return session;
}
