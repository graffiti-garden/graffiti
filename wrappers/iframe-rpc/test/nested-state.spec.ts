import type { Graffiti } from "@graffiti-garden/api";
import { expect, it, vi } from "vitest";
import { createGraffitiRelay, serveGraffiti } from "../host/index.js";

it.each([
  { method: "login", state: "", failure: false, loggedOut: false },
  { method: "login", state: '{"route":"/café?room=#🌱"}', failure: false, loggedOut: false },
  { method: "login", state: "canceled", failure: true, loggedOut: false },
  { method: "login", state: "signed-out-before-return", failure: false, loggedOut: true },
  { method: "logout", state: "signed-out", failure: false, loggedOut: false },
  { method: "logout", state: "canceled-sign-out", failure: true, loggedOut: false },
])("returns nested $method state after reload and late frame creation ($state)", async ({ method, state, failure, loggedOut }) => {
  let outer: HTMLIFrameElement;
  let stop: () => Promise<void>;
  let source: Graffiti;
  let request: { state?: string } | undefined;
  const events: { id: string; event: string; detail?: any }[] = [];
  const ready = new Set<string>();
  const removed = new Set<string>();
  const receive = (event: MessageEvent) => {
    if (event.source !== outer?.contentWindow) return;
    if (event.data?.type === "removed") removed.add(event.data.id);
    if (event.data?.type !== "session-event") return;
    if (event.data.event === "initialized") ready.add(event.data.id);
    else events.push(event.data);
  };
  window.addEventListener("message", receive);
  const emit = (type: string, detail?: unknown) => source.sessionEvents.dispatchEvent(new CustomEvent(type, { detail }));

  async function open(returnedState?: string) {
    ready.clear(); events.length = 0;
    source = {
      sessionEvents: new EventTarget(),
      login: async (options: unknown) => { request = options as typeof request; },
      logout: async (_session: unknown, options: unknown) => { request = options as typeof request; },
    } as unknown as Graffiti;
    const relay = createGraffitiRelay(source, "outer");
    const host = serveGraffiti(relay.graffiti);
    outer = document.createElement("iframe");
    outer.name = "outer";
    outer.srcdoc = `<script type="module" src=${JSON.stringify(new URL("./relay-frame.ts", import.meta.url).href)}></script>`;
    document.body.append(outer);
    host.connect({ remoteWindow: outer.contentWindow!, channel: "outer", stateId: relay.stateId });
    stop = async () => { relay.destroy(); await host.destroy(); outer.remove(); };
    // The result arrives before the RPC handshake, and before the child exists.
    if (returnedState !== undefined) emit(method, {
      state: returnedState,
      ...(failure ? { error: new Error("Canceled") } : method === "login"
        ? { session: { actor: "alice" } } : { actor: "alice" }),
    });
    emit("initialized");
    await vi.waitFor(() => expect(ready.has("outer")).toBe(true));
  }
  async function mount(id: string) {
    ready.delete(id);
    outer.contentWindow!.postMessage({ type: "mount", id }, "*");
    await vi.waitFor(() => expect(ready.has(id)).toBe(true));
  }
  try {
    await open();
    await mount("leaf");
    outer!.contentWindow!.postMessage({ type: "child-request", id: "leaf", method, state }, "*");
    await vi.waitFor(() => expect(request?.state).toBeTypeOf("string"));
    const returnedState = request!.state!;
    await stop!();
    await open(returnedState);
    if (loggedOut) {
      emit("logout", { actor: "alice" });
      await vi.waitFor(() => expect(events.some(event => event.id === "outer" && event.event === "logout")).toBe(true));
    }
    // An unrelated child receives ordinary restoration, never the caller's state.
    await mount("sibling");
    expect(events.filter(event => event.id === "sibling").every(event => event.detail.state === undefined)).toBe(true);
    const parentReplies = events.filter(event => event.id === "outer" && event.detail?.state !== undefined).length;
    await mount("leaf");
    const replies = events.filter(event => event.id === "leaf" && event.detail?.state !== undefined);
    expect(replies).toHaveLength(1);
    expect(replies[0].detail.state).toBe(state);
    expect(Boolean(replies[0].detail.error)).toBe(failure || loggedOut);
    expect(events.filter(event => event.id === "outer" && event.detail?.state !== undefined)).toHaveLength(parentReplies);

    // Recreating the same child again restores sessions, not the completed request.
    outer!.contentWindow!.postMessage({ type: "unmount", id: "leaf" }, "*");
    await vi.waitFor(() => expect(removed.has("leaf")).toBe(true));
    await mount("leaf");
    expect(events.filter(event => event.id === "leaf" && event.detail?.state !== undefined)).toHaveLength(1);
  } finally {
    window.removeEventListener("message", receive);
    await stop!();
  }
}, 20_000);
