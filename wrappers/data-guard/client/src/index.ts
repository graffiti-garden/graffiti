import { Graffiti, type GraffitiSession } from "@graffiti-garden/api";
import { GraffitiRpcClient } from "@graffiti-garden/wrapper-iframe-rpc/client";

declare const DATA_GUARD_DEFAULT_HOST_URL: string;

let instance: GraffitiGuarded | undefined;
const defaultConnectionTimeout = 10_000;

export interface GraffitiGuardedOptions {
  hostUrl?: string | URL;
  channel?: string;
  timeout?: number;
}

export interface GraffitiGuardSourceSegment {
  id: string;
  name: string;
}

export type GraffitiGuardSession = GraffitiSession & {
  source?: GraffitiGuardSourceSegment[];
};

/** A Graffiti implementation backed by a sandboxed guard iframe. */
// @ts-ignore Graffiti methods are delegated through the constructor proxy.
export class GraffitiGuarded extends Graffiti {
  readonly sessionEvents!: EventTarget;
  private readonly hostUrl!: URL;
  private readonly iframe!: HTMLIFrameElement;
  private readonly rpc!: GraffitiRpcClient;
  private readonly onMessage!: (event: MessageEvent) => void;
  private readonly connectionTimeout!: number;
  private destroyed = false;

  constructor(options: GraffitiGuardedOptions = {}) {
    super();
    if (instance) return instance;

    const hostUrl = new URL(
      options.hostUrl?.toString() ?? DATA_GUARD_DEFAULT_HOST_URL,
      document.baseURI,
    );
    const iframe = document.createElement("iframe");
    iframe.title = "Graffiti Guard";
    iframe.allow = "storage-access";
    iframe.sandbox.add(
      "allow-scripts",
      "allow-same-origin",
      "allow-storage-access-by-user-activation",
      "allow-downloads",
      "allow-forms",
      "allow-popups",
      "allow-top-navigation-by-user-activation",
    );
    iframe.src = hostUrl.href;
    iframe.setAttribute("aria-hidden", "true");
    Object.assign(iframe.style, {
      background: "transparent",
      border: "0",
      display: "none",
      height: "100vh",
      inset: "0",
      position: "fixed",
      width: "100vw",
      zIndex: "2147483647",
    });
    let connected = false;
    let connectionErrorShown = false;
    iframe.addEventListener("load", () => {
      // Bootstrap the guard with the browser-reported embedding origin, which
      // the RPC handshake verifies internally but does not expose to the host.
      iframe.contentWindow?.postMessage(
        {
          type: "graffiti-guard:connect",
          pageUrl: window.location.href,
        },
        hostUrl.origin,
      );
    });
    const showConnectionError = () => {
      if (connected || connectionErrorShown) return;
      connectionErrorShown = true;
      window.alert(
        `This app could not connect to its data service at ${hostUrl.origin}. ` +
          "The service may be offline, or your browser may be blocking its security certificate. " +
          "Open that address directly, then reload this page.",
      );
    };
    iframe.addEventListener("error", showConnectionError);
    document.body.append(iframe);

    const remoteWindow = iframe.contentWindow;
    if (!remoteWindow) {
      iframe.remove();
      throw new Error("Graffiti Guard iframe did not create a content window.");
    }

    const rpc = new GraffitiRpcClient({
      remoteWindow,
      allowedOrigins: [hostUrl.origin],
      channel: options.channel,
      timeout: options.timeout,
    });
    const connectionTimeout = window.setTimeout(
      showConnectionError,
      options.timeout ?? defaultConnectionTimeout,
    );
    const markConnected = () => {
      connected = true;
      window.clearTimeout(connectionTimeout);
    };
    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== remoteWindow ||
        event.origin !== hostUrl.origin ||
        !event.data ||
        typeof event.data !== "object"
      ) {
        return;
      }
      markConnected();
      if (
        event.data.type === "graffiti-guard:connected"
      ) {
        return;
      } else if (
        event.data.type === "graffiti-guard:set-visible" &&
        typeof event.data.visible === "boolean"
      ) {
        iframe.style.display = event.data.visible ? "block" : "none";
        iframe.setAttribute("aria-hidden", String(!event.data.visible));
        if (event.data.visible) {
          iframe.focus();
          remoteWindow.postMessage(
            { type: "graffiti-guard:shown" },
            hostUrl.origin,
          );
        }
      } else if (
        event.data.type === "graffiti-guard:open-audit" &&
        typeof event.data.actor === "string" &&
        Array.isArray(event.data.source)
      ) {
        window.location.assign(this.auditUrl(event.data));
      }
    };
    window.addEventListener("message", onMessage);

    this.hostUrl = hostUrl;
    this.iframe = iframe;
    this.rpc = rpc;
    this.sessionEvents = rpc.sessionEvents;
    this.onMessage = onMessage;
    this.connectionTimeout = connectionTimeout;

    instance = new Proxy(this, {
      get(target, property, receiver) {
        if (Reflect.has(target, property)) {
          return Reflect.get(target, property, receiver);
        }
        const value = Reflect.get(rpc, property, rpc);
        return typeof value === "function" ? value.bind(rpc) : value;
      },
    });
    return instance;
  }

  login: Graffiti["login"] = (actor) => {
    const loginUrl = new URL(this.hostUrl);
    loginUrl.searchParams.set("guardLogin", "1");
    loginUrl.searchParams.set("redirectUrl", window.location.href);
    if (actor) loginUrl.searchParams.set("suggestedActor", actor);
    window.location.assign(loginUrl.href);
    return Promise.resolve();
  };

  /** Link to the host-owned audit panel without exposing audit data to this app. */
  auditUrl(scope?: {
    actor?: string;
    source?: GraffitiGuardSourceSegment[];
  }) {
    const auditUrl = new URL(this.hostUrl);
    auditUrl.searchParams.set("redirectUrl", window.location.href);
    auditUrl.searchParams.set("source", JSON.stringify(scope?.source ?? []));
    if (scope?.actor) auditUrl.searchParams.set("actor", scope.actor);
    return auditUrl.href;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    window.clearTimeout(this.connectionTimeout);
    window.removeEventListener("message", this.onMessage);
    this.rpc.destroy();
    this.iframe.remove();
    if (instance === this) instance = undefined;
  }
}
