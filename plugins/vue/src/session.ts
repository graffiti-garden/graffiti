import { ref, type Ref } from "vue";
import type { Session as SolidSession } from "@inrupt/solid-client-authn-browser";
import { type GraffitiSession } from "@graffiti-garden/client-core";

let graffitiSession: Ref<GraffitiSession> | undefined = undefined;
export function useGraffitiSession() {
  if (!graffitiSession) {
    graffitiSession = ref(undefined);
  }
  return graffitiSession;
}

export async function registerSolidSession(options?: {
  solidSession?: SolidSession;
  onSessionRestore?: (href: string) => void;
}) {
  const solidSession =
    options?.solidSession ??
    (await import("@inrupt/solid-client-authn-browser")).getDefaultSession();
  const session = useGraffitiSession();
  function onStateChange() {
    if (solidSession.info.isLoggedIn && solidSession.info.webId) {
      session.value = {
        webId: solidSession.info.webId,
        fetch: solidSession.fetch,
      };
    } else {
      session.value = undefined;
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
