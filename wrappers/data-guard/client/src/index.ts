import { Graffiti, type GraffitiSession } from "@graffiti-garden/api";
import { GraffitiRpcClient } from "@graffiti-garden/wrapper-iframe-rpc/client";

let instance: GraffitiGuarded | undefined;

export interface GraffitiGuardedOptions {
  hostUrl: string | URL;
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
  private destroyed = false;

  constructor(options: GraffitiGuardedOptions) {
    super();
    if (instance) return instance;

    const hostUrl = new URL(options.hostUrl.toString(), document.baseURI);
    const iframe = document.createElement("iframe");
    iframe.title = "Graffiti Guard";
    iframe.allow = "storage-access; language-model";
    iframe.sandbox.add(
      "allow-scripts",
      "allow-same-origin",
      "allow-storage-access-by-user-activation",
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
    iframe.addEventListener("load", () => {
      // Bootstrap the guard with the browser-reported embedding origin, which
      // the RPC handshake verifies internally but does not expose to the host.
      iframe.contentWindow?.postMessage({ type: "graffiti-guard:connect" }, hostUrl.origin);
    });
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
    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== remoteWindow ||
        event.origin !== hostUrl.origin ||
        event.data?.type !== "graffiti-guard:set-visible" ||
        typeof event.data.visible !== "boolean"
      ) {
        return;
      }
      iframe.style.display = event.data.visible ? "block" : "none";
      iframe.setAttribute("aria-hidden", String(!event.data.visible));
    };
    window.addEventListener("message", onMessage);

    this.hostUrl = hostUrl;
    this.iframe = iframe;
    this.rpc = rpc;
    this.sessionEvents = rpc.sessionEvents;
    this.onMessage = onMessage;

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

  /** Open the host-owned audit panel without exposing audit data to this app. */
  audit(session?: GraffitiGuardSession) {
    const auditUrl = new URL(this.hostUrl);
    auditUrl.searchParams.set("redirectUrl", window.location.href);
    auditUrl.searchParams.set("source", JSON.stringify(session?.source ?? []));
    if (session?.actor) auditUrl.searchParams.set("actor", session.actor);
    window.location.assign(auditUrl.href);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener("message", this.onMessage);
    this.rpc.destroy();
    this.iframe.remove();
    if (instance === this) instance = undefined;
  }
}
