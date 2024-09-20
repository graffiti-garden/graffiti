import { ref, type Ref } from "vue";
import type { Session as SolidSession } from "@inrupt/solid-client-authn-browser";
import { type GraffitiSession } from "@graffiti-garden/client-core";

let graffitiSession: Ref<GraffitiSession> | undefined = undefined;
export function useGraffitiSession() {
  if (!graffitiSession) {
    graffitiSession = ref({ pods: [] });
  }
  return graffitiSession;
}

export async function registerSolidSession(options?: {
  solidSession?: SolidSession;
  onSessionRestore?: (href: string) => void;
  whichPod?: (solidSession: SolidSession) => string;
}) {
  const solidSession =
    options?.solidSession ??
    (await import("@inrupt/solid-client-authn-browser")).getDefaultSession();
  const session = useGraffitiSession();
  function onStateChange() {
    if (solidSession.info.isLoggedIn && solidSession.info.webId) {
      session.value = {
        ...session.value,
        webId: solidSession.info.webId,
        fetch: solidSession.fetch,
        // TODO: the pod (or multiple pods)
        // to use should be apparent in the user's
        // webId profile. But this works for now.
        pod: options?.whichPod
          ? options.whichPod(solidSession)
          : "https://pod.graffiti.garden",
      };
    } else {
      session.value = {
        pods: session.value.pods,
      };
    }
  }
  solidSession.events.on("login", onStateChange);
  solidSession.events.on("logout", onStateChange);
  solidSession.events.on("sessionRestore", (href: string) => {
    onStateChange();
    options?.onSessionRestore?.(href);
  });
  solidSession.handleIncomingRedirect({ restorePreviousSession: true });
}
