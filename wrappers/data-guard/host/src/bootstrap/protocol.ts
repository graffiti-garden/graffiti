export function listenToParent(connect: (origin: string) => void) {
  let origin: string | undefined;
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
      if (origin && origin !== event.origin) return;
      if (!origin) {
        origin = event.origin;
        connect(origin);
      }
    }
  });
}

export function setVisible(visible: boolean) {
  window.parent.postMessage(
    { type: "graffiti-guard:set-visible", visible },
    "*",
  );
}

export function requestAudit(
  actor: string,
  source: { id: string; name: string }[],
) {
  window.parent.postMessage(
    { type: "graffiti-guard:open-audit", actor, source, view: "permissions" },
    "*",
  );
}
