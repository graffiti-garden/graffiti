import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { expect, it, vi } from "vitest";
import { serveGraffiti } from "../host/index.js";
import type { Graffiti } from "@graffiti-garden/api";

it.each(["login", "logout"] as const)("preserves undefined %s options across a frame", async (method) => {
  const called = vi.fn(async (..._args: unknown[]) => {});
  const source = { sessionEvents: new EventTarget(), [method]: called } as unknown as Graffiti;
  const host = serveGraffiti(source);
  const frame = document.createElement("iframe");
  frame.name = `undefined-${method}`;
  // A relay supplies the optional argument explicitly, even when the app omitted it.
  frame.srcdoc = `<script type="module">
    import { GraffitiRpcClient } from "${new URL("../client/index.ts", import.meta.url)}";
    const graffiti = new GraffitiRpcClient({ remoteWindow: parent, channel: window.name });
    void ("${method}" === "login"
      ? graffiti.login(undefined)
      : graffiti.logout({ actor: "did:example:chosen" }, undefined));
  </script>`;
  try {
    document.body.append(frame);
    host.connect({ remoteWindow: frame.contentWindow!, channel: frame.name });
    await vi.waitFor(() => expect(called).toHaveBeenCalledExactlyOnceWith(
      ...(method === "login" ? [undefined] : [{ actor: "did:example:chosen" }, undefined]),
    ));
  } finally {
    await host.destroy();
    frame.remove();
  }
});

it.each(["login", "logout"] as const)("keeps equal %s state values separate across frames", async (method) => {
  const source = new GraffitiLocal();
  const forwardedStates = new Map<string, string>();
  const capture = (actor: string, state?: string) => { forwardedStates.set(actor, state ?? ""); };
  source.login = async options => capture(options?.actor ?? "", options?.state);
  source.logout = async (session, options) => capture(session.actor, options?.state);
  const host = serveGraffiti(source);
  source.sessionEvents.dispatchEvent(new CustomEvent("initialized"));

  const frames = ["first", "second"].map((name) => {
    const frame = document.createElement("iframe");
    frame.name = `rpc-${method}-state-${name}`;
    frame.srcdoc = `<script type="module">
      import { GraffitiRpcClient } from "${new URL("../client/index.ts", import.meta.url)}";
      const graffiti = new GraffitiRpcClient({
        remoteWindow: window.parent,
        channel: window.name,
      });
      graffiti.sessionEvents.addEventListener("initialized", () =>
        window.parent.postMessage({ type: "ready" }, "*"));
      graffiti.sessionEvents.addEventListener("${method}", (event) =>
        window.parent.postMessage({ type: "session-event", detail: event.detail }, "*"));
      window.addEventListener("message", (event) => {
        if (event.data?.type === "start-request")
          void ("${method}" === "login"
            ? graffiti.login({ actor: window.name, state: event.data.state })
            : graffiti.logout({ actor: window.name }, { state: event.data.state }));
      });
    </script>`;
    return frame;
  });
  const received: { state?: string; error?: Error }[][] = [[], []];
  const ready = new Set<number>();
  const onMessage = (event: MessageEvent) => {
    const index = frames.findIndex((frame) => event.source === frame.contentWindow);
    if (index < 0) return;
    if (event.data?.type === "ready") ready.add(index);
    if (event.data?.type === "session-event") received[index].push(event.data.detail);
  };
  window.addEventListener("message", onMessage);

  try {
    for (const frame of frames) {
      document.body.append(frame);
      host.connect({ remoteWindow: frame.contentWindow!, channel: frame.name });
    }
    await vi.waitFor(() => expect(ready.size).toBe(2));
    for (const frame of frames) {
      frame.contentWindow!.postMessage({ type: "start-request", state: "same" }, "*");
    }
    await vi.waitFor(() => expect(forwardedStates.size).toBe(2));
    const states = frames.map((frame) => forwardedStates.get(frame.name)!);
    expect(states[0]).not.toBe(states[1]);

    for (let index = 0; index < 2; index++) {
      source.sessionEvents.dispatchEvent(new CustomEvent(method, {
        detail: {
          ...(method === "login" ? { session: { actor: `did:example:${index}` } } : { actor: `did:example:${index}` }),
          state: states[index],
        },
      }));
    }
    await vi.waitFor(() => {
      expect(received[0]).toHaveLength(2);
      expect(received[1]).toHaveLength(2);
    });
    expect(received[0].filter((detail) => detail.state === "same")).toHaveLength(1);
    expect(received[1].filter((detail) => detail.state === "same")).toHaveLength(1);
    expect(received.flat().every((detail) =>
      detail.state === undefined || detail.state === "same"
    )).toBe(true);

    source.sessionEvents.dispatchEvent(new CustomEvent(method, {
      detail: { error: new Error("request failed"), state: states[0] },
    }));
    await vi.waitFor(() =>
      expect(received.map((events) => events.filter((event) => event.error).length))
        .toEqual([1, 0]));

    // Invalid state values must reach implementation validation without string coercion.
    frames[0].contentWindow!.postMessage({ type: "start-request", state: 42 }, "*");
    await vi.waitFor(() => expect(forwardedStates.get(frames[0].name)).toBe(42));
  } finally {
    window.removeEventListener("message", onMessage);
    await host.destroy();
    for (const frame of frames) frame.remove();
  }
});

it.each(["connecting", "login", "initialized"])("forwards a result when logout is called during %s", async (trigger) => {
  const source = new GraffitiLocal();
  source.logout = async (session, options) => {
    source.sessionEvents.dispatchEvent(new CustomEvent("logout", {
      detail: { actor: session.actor, state: options?.state },
    }));
  };
  const host = serveGraffiti(source);
  source.sessionEvents.dispatchEvent(new CustomEvent("login", { detail: { session: { actor: "did:example:chosen" } } }));
  if (trigger !== "connecting") source.sessionEvents.dispatchEvent(new CustomEvent("initialized"));
  const frame = document.createElement("iframe");
  frame.name = `initialize-logout-${crypto.randomUUID()}`;
  frame.srcdoc = `<script type="module">
    import { GraffitiRpcClient } from "${new URL("../client/index.ts", import.meta.url)}";
    const graffiti = new GraffitiRpcClient({ remoteWindow: parent, channel: window.name });
    const logout = () => graffiti.logout({ actor: "did:example:chosen" }, { state: "immediate" });
    if ("${trigger}" === "connecting") void logout();
    else graffiti.sessionEvents.addEventListener("${trigger}", logout);
    graffiti.sessionEvents.addEventListener("logout", event =>
      parent.postMessage({ type: "logout", detail: event.detail }, "*"));
  </script>`;
  const received: unknown[] = [];
  const onMessage = (event: MessageEvent) => {
    if (event.source === frame.contentWindow && event.data?.type === "logout") received.push(event.data.detail);
  };
  window.addEventListener("message", onMessage);
  try {
    document.body.append(frame);
    host.connect({ remoteWindow: frame.contentWindow!, channel: frame.name });
    await vi.waitFor(() => expect(received).toEqual([
      { actor: "did:example:chosen", state: "immediate" },
    ]));
    if (trigger === "connecting") source.sessionEvents.dispatchEvent(new CustomEvent("initialized"));
  } finally {
    window.removeEventListener("message", onMessage);
    await host.destroy();
    frame.remove();
  }
});
