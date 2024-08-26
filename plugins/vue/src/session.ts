import { reactive, type Reactive } from "vue";
import {
  getDefaultSession as getSolidSession,
  handleIncomingRedirect,
} from "@inrupt/solid-client-authn-browser";
import GraffitiClient from "@graffiti-garden/client-core";

let graffitiSession:
  | Reactive<{
      webId?: string;
      defaultPod?: string;
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
    !!graffitiSession.defaultPod &&
    !graffitiSession.isInitializing;
}

function registerGraffitiSession(options?: {
  onSessionRestore?: (url: string) => void;
}) {
  if (!registered) {
    registered = true;
    const solidSession = getSolidSession();
    const graffitiSession = useGraffitiSession();

    const defaultPod = localStorage.getItem("graffiti:defaultPod") ?? undefined;
    setDefaultPod(defaultPod);

    function handleWebIdLogInOrOut() {
      graffitiSession.webId = solidSession.info.isLoggedIn
        ? solidSession.info.webId
        : undefined;
      graffitiSession.fetch = solidSession.fetch;
      setGraffitiSessionIsReady();
    }

    solidSession.events.on("login", handleWebIdLogInOrOut);
    solidSession.events.on("logout", handleWebIdLogInOrOut);
    if (options?.onSessionRestore) {
      solidSession.events.on("sessionRestore", options?.onSessionRestore);
    }

    handleIncomingRedirect({ restorePreviousSession: true }).then(() => {
      graffitiSession.isInitializing = false;
      handleWebIdLogInOrOut();
    });
  }
}

export function useGraffitiSession(
  ...args: Parameters<typeof registerGraffitiSession>
) {
  if (!graffitiSession) {
    graffitiSession = reactive({
      webId: undefined,
      defaultPod: undefined,
      fetch: window.fetch,
      isReady: false,
      isInitializing: true,
    });
    registerGraffitiSession(...args);
  }
  return graffitiSession;
}

export function useGraffiti(
  ...args: Parameters<typeof registerGraffitiSession>
) {
  const graffitiSession = useGraffitiSession();
  if (!graffiti) {
    graffiti = new Proxy(new GraffitiClient(), {
      get(target, prop, receiver) {
        let value = Reflect.get(target, prop, receiver);
        if (typeof value === "function") {
          value = value.bind(target);
        }

        if (prop === "get") {
          return (...args: Parameters<typeof target.get>) => {
            const options = args[1] ?? {};
            options.fetch = options.fetch ?? graffitiSession.fetch;
            return value(args[0], options);
          };
        } else if (prop === "put") {
          return (...args: Parameters<typeof target.put>) => {
            const options = args[2] ?? {};
            options.fetch = options.fetch ?? graffitiSession.fetch;
            options.webId = options.webId ?? graffitiSession.webId;
            options.pod = options.pod ?? graffitiSession.defaultPod;
            return value(args[0], args[1], options);
          };
        } else if (prop === "patch") {
          return (...args: Parameters<typeof target.patch>) => {
            const options = args[2] ?? {};
            options.fetch = options.fetch ?? graffitiSession.fetch;
            return value(args[0], args[1], options);
          };
        } else if (prop === "delete") {
          return (...args: Parameters<typeof target.delete>) => {
            const options = args[1] ?? {};
            options.fetch = options.fetch ?? graffitiSession.fetch;
            return value(args[0], options);
          };
        } else if (prop === "discover") {
          return (...args: Parameters<typeof target.discover>) => {
            const options = args[1] ?? {};
            options.fetch = options.fetch ?? graffitiSession.fetch;
            options.pods =
              options.pods ??
              (graffitiSession.defaultPod
                ? [graffitiSession.defaultPod]
                : undefined);
            return value(args[0], options);
          };
        } else if (prop === "listOrphans") {
          return (...args: Parameters<typeof target.listOrphans>) => {
            const options = args[0] ?? {};
            options.fetch = options.fetch ?? graffitiSession?.fetch;
            options.pods =
              options.pods ??
              (graffitiSession.defaultPod
                ? [graffitiSession.defaultPod]
                : undefined);
            return value(options);
          };
        } else if (prop === "listChannels") {
          return (...args: Parameters<typeof target.listChannels>) => {
            const options = args[0] ?? {};
            options.fetch = options.fetch ?? graffitiSession?.fetch;
            options.pods =
              options.pods ??
              (graffitiSession.defaultPod
                ? [graffitiSession.defaultPod]
                : undefined);
            return value(options);
          };
        } else {
          return value;
        }
      },
    });

    registerGraffitiSession(...args);
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

export async function setDefaultPod(defaultPod?: string) {
  defaultPod = defaultPod && defaultPod.length ? defaultPod : undefined;
  if (defaultPod) {
    localStorage.setItem("graffiti:defaultPod", defaultPod);
  } else {
    localStorage.removeItem("graffiti:defaultPod");
  }
  useGraffitiSession().defaultPod = defaultPod;
  setGraffitiSessionIsReady();
}

export async function unsetDefaultPod() {
  setDefaultPod(undefined);
}
