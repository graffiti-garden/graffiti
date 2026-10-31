import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { expect, it, vi } from "vitest";
import { serveGraffiti } from "../host/index.js";

it.each(["login", "logout"] as const)("keeps equal %s request IDs separate across frames", async (method) => {
  const source = new GraffitiLocal();
  const forwardedIds = new Map<string, string>();
  const capture = (actor: string, requestId?: string) => { forwardedIds.set(actor, requestId ?? ""); };
  source.login = async options => capture(options?.actor ?? "", options?.requestId);
  source.logout = async (session, options) => capture(session.actor, options?.requestId);
  const host = serveGraffiti(source);
  source.sessionEvents.dispatchEvent(new CustomEvent("initialized"));

  const frames = ["first", "second"].map((name) => {
    const frame = document.createElement("iframe");
    frame.name = `rpc-${method}-request-id-${name}`;
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
            ? graffiti.login({ actor: window.name, requestId: event.data.requestId })
            : graffiti.logout({ actor: window.name }, { requestId: event.data.requestId }));
      });
    </script>`;
    return frame;
  });
  const received: { requestId?: string; error?: Error }[][] = [[], []];
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
      frame.contentWindow!.postMessage({ type: "start-request", requestId: "same" }, "*");
    }
    await vi.waitFor(() => expect(forwardedIds.size).toBe(2));
    const ids = frames.map((frame) => forwardedIds.get(frame.name)!);
    expect(ids[0]).not.toBe(ids[1]);

    for (let index = 0; index < 2; index++) {
      source.sessionEvents.dispatchEvent(new CustomEvent(method, {
        detail: {
          ...(method === "login" ? { session: { actor: `did:example:${index}` } } : { actor: `did:example:${index}` }),
          requestId: ids[index],
        },
      }));
    }
    await vi.waitFor(() => {
      expect(received[0]).toHaveLength(2);
      expect(received[1]).toHaveLength(2);
    });
    expect(received[0].filter((detail) => detail.requestId === "same")).toHaveLength(1);
    expect(received[1].filter((detail) => detail.requestId === "same")).toHaveLength(1);
    expect(received.flat().every((detail) =>
      detail.requestId === undefined || detail.requestId === "same"
    )).toBe(true);

    source.sessionEvents.dispatchEvent(new CustomEvent(method, {
      detail: { error: new Error("request failed"), requestId: ids[0] },
    }));
    await vi.waitFor(() =>
      expect(received.map((events) => events.filter((event) => event.error).length))
        .toEqual([1, 0]));

    // Invalid IDs must reach implementation validation without string coercion.
    frames[0].contentWindow!.postMessage({ type: "start-request", requestId: 42 }, "*");
    await vi.waitFor(() => expect(forwardedIds.get(frames[0].name)).toBe(42));
  } finally {
    window.removeEventListener("message", onMessage);
    await host.destroy();
    for (const frame of frames) frame.remove();
  }
});

it.each([
  { failure: false, loggedOut: false },
  { failure: true, loggedOut: false },
  { failure: false, loggedOut: true },
])("delivers a current guard result once despite overlapping initialization ($failure, $loggedOut)", async ({ failure, loggedOut }) => {
  const source = new GraffitiLocal();
  source.sessionEvents = new EventTarget(); // Control when restoration finishes.
  const host = serveGraffiti(source);
  for (const actor of ["did:example:other", "did:example:chosen"]) {
    source.sessionEvents.dispatchEvent(new CustomEvent("login", { detail: { session: { actor } } }));
  }
  if (loggedOut) source.sessionEvents.dispatchEvent(new CustomEvent("logout", {
    detail: { actor: "did:example:chosen" },
  }));
  const frame = document.createElement("iframe");
  frame.name = `guard-result-${crypto.randomUUID()}`;
  frame.srcdoc = `<script type="module">
    import { GraffitiRpcClient } from "${new URL("../client/index.ts", import.meta.url)}";
    const graffiti = new GraffitiRpcClient({ remoteWindow: parent, channel: window.name });
    for (const type of ["login", "initialized"]) graffiti.sessionEvents.addEventListener(type, event =>
      parent.postMessage({ type, detail: event.detail }, "*"));
    const remote = await graffiti.remote();
    const pending = Promise.all([remote.initialize(), remote.initialize()]);
    parent.postMessage({ type: "initializing" }, "*");
    await pending;
    parent.postMessage({ type: "complete" }, "*");
  </script>`;
  const received: { type: string; detail: any }[] = [];
  let initializing = false, complete = false;
  const onMessage = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow) return;
    if (event.data?.type === "initializing") initializing = true;
    else if (event.data?.type === "complete") complete = true;
    else if (["login", "initialized"].includes(event.data?.type)) received.push(event.data);
  };
  window.addEventListener("message", onMessage);
  try {
    document.body.append(frame);
    host.connect({
      remoteWindow: frame.contentWindow!, channel: frame.name,
      initialLoginResult: () => failure
        ? { error: new Error("Login failed"), requestId: "caller-id" }
        : { session: { actor: "did:example:chosen" }, requestId: "caller-id" },
    });
    await vi.waitFor(() => expect(initializing).toBe(true));
    source.sessionEvents.dispatchEvent(new CustomEvent("initialized"));
    await vi.waitFor(() => expect(complete).toBe(true));
    expect(received.filter(event => event.type === "initialized")).toHaveLength(1);
    expect(received[0].detail.requestId).toBe("caller-id");
    expect(Boolean(received[0].detail.error)).toBe(failure || loggedOut);
    expect(received.filter(event => event.detail?.requestId)).toHaveLength(1);
    expect(received.filter(event => event.detail?.session?.actor === "did:example:chosen"))
      .toHaveLength(loggedOut ? 0 : 1);
    expect(received.find(event => event.detail?.session?.actor === "did:example:other")?.detail.requestId)
      .toBeUndefined();
  } finally {
    window.removeEventListener("message", onMessage);
    await host.destroy();
    frame.remove();
  }
});

it.each(["connecting", "login", "initialized"])("forwards a result when logout is called during %s", async (trigger) => {
  const source = new GraffitiLocal();
  source.logout = async (session, options) => {
    source.sessionEvents.dispatchEvent(new CustomEvent("logout", {
      detail: { actor: session.actor, requestId: options?.requestId },
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
    const logout = () => graffiti.logout({ actor: "did:example:chosen" }, { requestId: "immediate" });
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
      { actor: "did:example:chosen", requestId: "immediate" },
    ]));
    if (trigger === "connecting") source.sessionEvents.dispatchEvent(new CustomEvent("initialized"));
  } finally {
    window.removeEventListener("message", onMessage);
    await host.destroy();
    frame.remove();
  }
});
