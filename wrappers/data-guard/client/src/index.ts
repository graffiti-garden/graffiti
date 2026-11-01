import { Graffiti } from "@graffiti-garden/api";
import { GraffitiRpcClient } from "@graffiti-garden/wrapper-iframe-rpc/client";
import { withGuardSource, type GuardLoginOptions, type GuardSourceSegment } from "./source.js";
export { withGuardSource } from "./source.js";
export type {
  GuardSourceSegment as GraffitiGuardSourceSegment,
  GuardSession as GraffitiGuardSession,
} from "./source.js";

declare const DATA_GUARD_DEFAULT_HOST_URL: string;

let instance: GraffitiGuarded | undefined;
const defaultConnectionTimeout = 10_000;
const pendingLoginKey = "graffiti-guard-login:";

export interface GraffitiGuardedOptions {
  hostUrl?: string | URL;
  channel?: string;
  timeout?: number;
}

/** A Graffiti implementation backed by a sandboxed guard iframe. */
// @ts-ignore Graffiti methods are delegated through the constructor proxy.
export class GraffitiGuarded extends Graffiti {
  readonly sessionEvents!: Graffiti["sessionEvents"];
  private readonly hostUrl!: URL;
  private readonly iframe!: HTMLIFrameElement;
  private readonly rpc!: GraffitiRpcClient;
  private readonly onMessage!: (event: MessageEvent) => void;
  private readonly connectionTimeout!: number;
  private readonly stopSessionEvents!: () => void;
  private destroyed = false;
  private returnFocus: HTMLElement | null = null;
  private readonly backgroundInert = new Map<HTMLElement, boolean>();
  private backgroundObserver: MutationObserver | undefined;

  constructor(options: GraffitiGuardedOptions = {}) {
    super();
    if (instance) {
      // Another consumer may attach after initialization. The public RPC client
      // constructor replays its restored sessions to the newly attached listeners.
      new GraffitiRpcClient({ remoteWindow: instance.iframe.contentWindow! });
      return instance;
    }

    const hostUrl = new URL(
      options.hostUrl?.toString() ?? DATA_GUARD_DEFAULT_HOST_URL,
      document.baseURI,
    );
    const loginKey = pendingLoginKey + hostUrl.origin;
    const loginNonce = sessionStorage.getItem(loginKey);
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
      // Keep the overlay within the visible viewport when browser controls move.
      height: CSS.supports("height", "100svh") ? "100svh" : "100vh",
      inset: "0",
      position: "fixed",
      width: "100%",
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
          ...(loginNonce ? { loginNonce } : {}),
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
    const scoped = withGuardSource(rpc, () => undefined);
    this.sessionEvents = scoped.graffiti.sessionEvents;
    this.stopSessionEvents = scoped.destroy;
    this.sessionEvents.addEventListener("initialized", () => {
      if (sessionStorage.getItem(loginKey) === loginNonce) sessionStorage.removeItem(loginKey);
    }, { once: true });
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
        this.setGuardVisible(event.data.visible);
        if (event.data.visible) {
          remoteWindow.postMessage(
            { type: "graffiti-guard:shown" },
            hostUrl.origin,
          );
        }
      } else if (
        event.data.type === "graffiti-guard:open-storage-setup" &&
        typeof event.data.url === "string"
      ) {
        try {
          const setupUrl = new URL(event.data.url);
          const setupParams = new URLSearchParams(setupUrl.hash.slice(1));
          if (
            setupUrl.origin !== hostUrl.origin ||
            (setupParams.get("guardStorageSetup") !== "1" &&
              setupUrl.searchParams.get("guardStorageSetup") !== "1")
          ) {
            return;
          }
          window.location.assign(setupUrl);
        } catch {}
      } else if (event.data.type === "graffiti-guard:open-login") {
        this.redirectLogin(event.data.options);
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

  private redirectLogin(options: GuardLoginOptions) {
    const loginUrl = new URL(this.hostUrl);
    const nonce = crypto.randomUUID();
    sessionStorage.setItem(pendingLoginKey + this.hostUrl.origin, nonce);
    // Keep return URLs and caller state out of the HTTP request, including long URLs.
    const params = new URLSearchParams({
      guardLogin: "1", redirectUrl: window.location.href,
      loginNonce: nonce, source: JSON.stringify(options.source ?? []),
    });
    if (options.actor) params.set("suggestedActor", options.actor);
    if (options.state !== undefined) params.set("state", options.state);
    loginUrl.hash = params.toString();
    window.location.assign(loginUrl.href);
  }

  /** Link to the host-owned audit panel without exposing audit data to this app. */
  auditUrl(scope?: {
    actor?: string;
    source?: GuardSourceSegment[];
  }) {
    const auditUrl = new URL(this.hostUrl);
    const params = new URLSearchParams({
      redirectUrl: window.location.href,
      source: JSON.stringify(scope?.source ?? []),
    });
    if (scope?.actor) params.set("actor", scope.actor);
    auditUrl.hash = params.toString();
    return auditUrl.href;
  }

  private setGuardVisible(visible: boolean) {
    if (visible) {
      if (this.iframe.style.display === "block") return;
      const focused = document.activeElement;
      this.returnFocus =
        focused instanceof HTMLElement && focused !== this.iframe
          ? focused
          : null;
      this.inertBackground();
      this.backgroundObserver = new MutationObserver(() => this.inertBackground());
      this.backgroundObserver.observe(document.body, { childList: true });
      this.iframe.style.display = "block";
      this.iframe.setAttribute("aria-hidden", "false");
      this.iframe.focus();
      return;
    }

    if (this.iframe.style.display === "none") return;

    this.iframe.style.display = "none";
    this.iframe.setAttribute("aria-hidden", "true");
    this.backgroundObserver?.disconnect();
    this.backgroundObserver = undefined;
    for (const [element, wasInert] of this.backgroundInert) {
      element.inert = wasInert;
    }
    this.backgroundInert.clear();
    const target = this.returnFocus;
    this.returnFocus = null;
    if (target?.isConnected && !target.inert && target !== document.body) {
      target.focus({ preventScroll: true });
    } else {
      const previousTabindex = document.body.getAttribute("tabindex");
      document.body.tabIndex = -1;
      document.body.focus({ preventScroll: true });
      if (previousTabindex === null) document.body.removeAttribute("tabindex");
      else document.body.setAttribute("tabindex", previousTabindex);
    }
  }

  private inertBackground() {
    for (const child of Array.from(document.body.children)) {
      if (child === this.iframe || !(child instanceof HTMLElement)) continue;
      if (!this.backgroundInert.has(child)) {
        this.backgroundInert.set(child, child.inert);
      }
      child.inert = true;
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    window.clearTimeout(this.connectionTimeout);
    window.removeEventListener("message", this.onMessage);
    if (this.iframe.style.display === "block") this.setGuardVisible(false);
    this.rpc.destroy();
    this.stopSessionEvents();
    this.iframe.remove();
    if (instance === this) instance = undefined;
  }
}
