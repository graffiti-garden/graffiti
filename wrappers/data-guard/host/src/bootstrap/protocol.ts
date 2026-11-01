export const visibilityEvents = new EventTarget();
let parentOrigin: string | undefined;

export function listenToParent(
  connect: (origin: string, loginNonce?: string) => void,
) {
  window.addEventListener("message", (event) => {
    if (
      event.source !== window.parent ||
      !event.data ||
      typeof event.data !== "object"
    ) {
      return;
    }
    // Pin the browser-reported parent origin before starting RPC. This does not
    // trust the parent; it prevents origin spoofing and scopes both permissions
    // and RPC messages to the actual embedding origin.
    if (event.data.type === "graffiti-guard:connect") {
      if (!event.origin || event.origin === "null") return;
      if (parentOrigin && parentOrigin !== event.origin) return;
      if (!parentOrigin) {
        parentOrigin = event.origin;
        // Acknowledge before storage initialization, which may wait for user
        // interaction. The embedder can distinguish a responsive guard from
        // a URL the browser refused to load (for example, an untrusted local
        // HTTPS certificate).
        window.parent.postMessage(
          { type: "graffiti-guard:connected" },
          parentOrigin,
        );
        connect(
          parentOrigin,
          typeof event.data.loginNonce === "string"
            ? event.data.loginNonce
            : undefined,
        );
      }
    } else if (
      parentOrigin &&
      event.origin === parentOrigin &&
      event.data.type === "graffiti-guard:shown"
    ) {
      visibilityEvents.dispatchEvent(new Event("shown"));
    }
  });
}

export function setVisible(visible: boolean) {
  postToParent({ type: "graffiti-guard:set-visible", visible });
}

export function requestLoginRedirect(options: import("../../../client/src/source.js").GuardLoginOptions) {
  postToParent({ type: "graffiti-guard:open-login", options });
}

export function requestAudit(
  actor: string,
  source: { id: string; name: string }[],
) {
  postToParent({ type: "graffiti-guard:open-audit", actor, source });
}

function postToParent(message: object) {
  if (!parentOrigin) return;
  window.parent.postMessage(message, parentOrigin);
}
