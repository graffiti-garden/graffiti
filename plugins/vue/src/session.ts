import { reactive, type Reactive } from "vue";
import {
  getDefaultSession as getSolidSession,
  handleIncomingRedirect,
} from "@inrupt/solid-client-authn-browser";
import GraffitiClient from "@graffiti-garden/client-core";

let graffitiSession:
  | Reactive<{
      webId?: string;
      homePod?: string;
      fetch: typeof window.fetch;
      isReady: boolean;
      isInitializing: boolean;
    }>
  | undefined = undefined;
let graffiti: GraffitiClient | undefined = undefined;
let registered = false;

function setGraffitiSessionIsReady() {
  const graffitiSession = useGraffitiSession();
  graffitiSession.isReady =
    !!graffitiSession.webId &&
    !!graffitiSession.homePod &&
    !graffitiSession.isInitializing;
}

async function registerGraffitiSession() {
  if (!registered) {
    registered = true;
    const solidSession = getSolidSession();
    const graffitiSession = useGraffitiSession();
    const graffiti = useGraffiti();

    const homePod = localStorage.getItem("graffiti:homePod") ?? undefined;
    setHomePod(homePod);

    function handleWebIdLogInOrOut() {
      graffitiSession.webId = solidSession.info.isLoggedIn
        ? solidSession.info.webId
        : undefined;
      graffitiSession.fetch = solidSession.fetch;
      setGraffitiSessionIsReady();
      graffiti?.setFetch(graffitiSession.fetch);
      graffiti?.setWebId(graffitiSession.webId);
    }

    solidSession.events.on("login", handleWebIdLogInOrOut);
    solidSession.events.on("logout", handleWebIdLogInOrOut);

    await handleIncomingRedirect({ restorePreviousSession: true });
    graffitiSession.isInitializing = false;
    handleWebIdLogInOrOut();
  }
}

export function useGraffitiSession() {
  if (!graffitiSession) {
    graffitiSession = reactive({
      webId: undefined,
      homePod: undefined,
      fetch: window.fetch,
      isReady: false,
      isInitializing: true,
    });
    registerGraffitiSession();
  }
  return graffitiSession;
}

export function useGraffiti() {
  if (!graffiti) {
    graffiti = new GraffitiClient();
    registerGraffitiSession();
  }
  return graffiti;
}

export async function webIdLogin(
  oidcIssuer: string,
  clientName: string,
  redirectPath?: string,
) {
  const solidSession = getSolidSession();
  let redirectUrl = window.origin;
  if (redirectPath) {
    redirectUrl += redirectPath.startsWith("/") ? "" : "/";
    redirectUrl += redirectPath;
  }
  await solidSession.login({
    oidcIssuer,
    redirectUrl,
    clientName,
  });
}

export async function webIdLogout() {
  await getSolidSession().logout();
}

export async function setHomePod(homePod?: string) {
  homePod = homePod && homePod.length ? homePod : undefined;
  if (homePod) {
    localStorage.setItem("graffiti:homePod", homePod);
  } else {
    localStorage.removeItem("graffiti:homePod");
  }
  useGraffiti().setHomePod(homePod);
  useGraffitiSession().homePod = homePod;
  setGraffitiSessionIsReady();
}

export async function unsetHomePod() {
  setHomePod(undefined);
}
