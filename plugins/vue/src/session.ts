import { reactive, type Reactive } from "vue";
import {
  getDefaultSession,
  handleIncomingRedirect,
} from "@inrupt/solid-client-authn-browser";
import GraffitiClient from "@graffiti-garden/client-core";

let sessionInfo:
  | Reactive<{
      webId?: string;
      homePod?: string;
      fetch: typeof window.fetch;
      isSessionReady: boolean;
      initializing: boolean;
    }>
  | undefined = undefined;
let graffitiClient: GraffitiClient | undefined = undefined;
let registered = false;

function setIsSessionReady() {
  const sessionInfo = useSessionInfo();
  sessionInfo.isSessionReady =
    !!sessionInfo.webId && !!sessionInfo.homePod && !sessionInfo.initializing;
}

async function registerSession() {
  if (!registered) {
    registered = true;
    const session = getDefaultSession();
    const sessionInfo = useSessionInfo();
    const graffitiClient = useGraffitiClient();

    const homePod = localStorage.getItem("graffitiClient:homePod") ?? undefined;
    setHomePod(homePod);

    function handleWebIdLogInOrOut() {
      sessionInfo.webId = session.info.isLoggedIn
        ? session.info.webId
        : undefined;
      sessionInfo.fetch = session.fetch;
      setIsSessionReady();
      graffitiClient?.setFetch(sessionInfo.fetch);
      graffitiClient?.setWebId(sessionInfo.webId);
    }

    session.events.on("login", handleWebIdLogInOrOut);
    session.events.on("logout", handleWebIdLogInOrOut);

    await handleIncomingRedirect({ restorePreviousSession: true });
    sessionInfo.initializing = false;
    handleWebIdLogInOrOut();
  }
}

export function useSessionInfo() {
  if (!sessionInfo) {
    sessionInfo = reactive({
      webId: undefined,
      homePod: undefined,
      fetch: window.fetch,
      isSessionReady: false,
      initializing: true,
    });
    registerSession();
  }
  return sessionInfo;
}

export function useGraffitiClient() {
  if (!graffitiClient) {
    graffitiClient = new GraffitiClient();
    registerSession();
  }
  return graffitiClient;
}

export async function webIdLogin(
  oidcIssuer: string,
  clientName: string,
  redirectPath?: string,
) {
  const session = getDefaultSession();
  let redirectUrl = window.origin;
  if (redirectPath) {
    redirectUrl += redirectPath.startsWith("/") ? "" : "/";
    redirectUrl += redirectPath;
  }
  await session.login({
    oidcIssuer,
    redirectUrl,
    clientName,
  });
}

export async function webIdLogout() {
  await getDefaultSession().logout();
}

export async function setHomePod(homePod?: string) {
  homePod = homePod && homePod.length ? homePod : undefined;
  if (homePod) {
    localStorage.setItem("graffitiClient:homePod", homePod);
  } else {
    localStorage.removeItem("graffitiClient:homePod");
  }
  useGraffitiClient().setHomePod(homePod);
  useSessionInfo().homePod = homePod;
  setIsSessionReady();
}

export async function unsetHomePod() {
  setHomePod(undefined);
}
