import type {
  Graffiti,
  GraffitiLoginEvent,
  GraffitiLogoutEvent,
  GraffitiMedia,
  GraffitiObjectStream,
  GraffitiPostMedia,
  GraffitiSession,
} from "@graffiti-garden/api";
import { connect as connectRpc, Reply, WindowMessenger } from "penpal";
import { statePrefix } from "../client/session-relay.js";
export { createGraffitiRelay } from "../client/session-relay.js";

type ClientMethods = {
  sessionEvent(type: string, detail?: unknown): Promise<void>;
};

type ConnectionState = {
  send(type: string, detail?: unknown): Promise<void>;
  initialized: boolean;
  statePrefix: string;
  destroy(): Promise<void>;
};

type SerializedMedia = Omit<GraffitiMedia, "data"> & {
  data: { buffer: ArrayBuffer; type: string };
};

type SerializedPostMedia = Omit<GraffitiPostMedia, "data"> & {
  data: { buffer: ArrayBuffer; type: string };
};

const simpleMethods = [
  "post",
  "get",
  "delete",
  "deleteMedia",
  "actorToHandle",
  "handleToActor",
] as const;

const sessionEventTypes = ["login", "logout", "initialized"] as const;

export interface GraffitiRpcConnectionOptions {
  remoteWindow: Window;
  allowedOrigins?: (string | RegExp)[];
  channel?: string;
  timeout?: number;
  /** Stable, unique within the containing page, when requests may survive a reload. */
  stateId?: string;
}

/** Expose one Graffiti implementation through any number of iframe connections. */
export function serveGraffiti(graffiti: Graffiti) {
  const sessions = new Map<string, GraffitiSession>();
  const connections = new Set<ConnectionState>();
  let resolveInitialized!: () => void;
  const initialized = new Promise<void>((resolve) => { resolveInitialized = resolve; });
  let destroyed = false;

  const forward = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;

    if (event.type === "login") {
      const detail = event.detail as GraffitiLoginEvent["detail"];
      if (!detail.error) sessions.set(detail.session.actor, detail.session);
    } else if (event.type === "logout") {
      const detail = event.detail as GraffitiLogoutEvent["detail"];
      if (!detail.error) sessions.delete(detail.actor);
    } else if (event.type === "initialized") {
      resolveInitialized();
    }

    for (const connection of connections) {
      let detail = event.detail;
      if (event.type === "login" || event.type === "logout") {
        const { state, ...rest } = detail as GraffitiLoginEvent["detail"] | GraffitiLogoutEvent["detail"];
        const ownState = typeof state === "string" &&
            state.startsWith(connection.statePrefix)
          ? state.slice(connection.statePrefix.length)
          : undefined;
        // Explicit results reach their caller even before session restoration finishes.
        if (!connection.initialized && ownState === undefined) continue;
        // Failures belong to the caller; successful session changes are shared.
        if (rest.error && state !== undefined && ownState === undefined) continue;
        detail = ownState === undefined ? rest : { ...rest, state: ownState };
      } else if (!connection.initialized) continue;
      void connection.send(event.type, detail).catch(() => {});
    }
  };

  for (const type of sessionEventTypes) {
    graffiti.sessionEvents.addEventListener(type, forward);
  }

  const rpcSimpleMethods = Object.fromEntries(
    simpleMethods.map((method) => [
      method,
      (...args: unknown[]) => {
        const call = graffiti[method] as (...args: unknown[]) => unknown;
        return call.apply(graffiti, args);
      },
    ]),
  );

  function connect(options: GraffitiRpcConnectionOptions) {
    if (destroyed) throw new Error("Graffiti RPC host has been destroyed.");

    const state: ConnectionState = {
      initialized: false,
      statePrefix: statePrefix(options.stateId ?? crypto.randomUUID()),
      async send(type, detail) {
        // A redirect result may arrive before the iframe finishes connecting.
        const client = await connection.promise;
        if (!connectionDestroyed) await client.sessionEvent(type, detail);
      },
      destroy: destroyConnection,
    };
    if ([...connections].some(connection => connection.statePrefix === state.statePrefix)) {
      throw new Error("RPC stateId must be unique among this host's connections.");
    }
    const streams = new Map<string, GraffitiObjectStream<{}>>();
    let connectionDestroyed = false;

    function scopeState<T extends { state?: string }>(options?: T): T | undefined {
      return typeof options?.state !== "string" ? options :
        { ...options, state: state.statePrefix + options.state };
    }

    const connection = connectRpc<ClientMethods>({
      messenger: new WindowMessenger({
        remoteWindow: options.remoteWindow,
        // Sandboxed srcdoc frames have opaque origins.
        allowedOrigins: options.allowedOrigins ?? ["*"],
      }),
      channel: options.channel,
      timeout: options.timeout,
      methods: {
        ...rpcSimpleMethods,
        login(options?: Parameters<Graffiti["login"]>[0]) {
          return graffiti.login(scopeState(options));
        },
        logout(session: GraffitiSession, options?: Parameters<Graffiti["logout"]>[1]) {
          return graffiti.logout(session, scopeState(options));
        },
        async postMedia(media: SerializedPostMedia, session: GraffitiSession) {
          const data = new Blob([media.data.buffer], { type: media.data.type });
          return graffiti.postMedia({ ...media, data }, session);
        },
        async getMedia(...args: Parameters<Graffiti["getMedia"]>) {
          const result = await graffiti.getMedia(...args);
          const buffer = await result.data.arrayBuffer();
          return new Reply(
            {
              ...result,
              data: { buffer, type: result.data.type },
            } satisfies SerializedMedia,
            { transferables: [buffer] },
          );
        },
        async discover(id: string, ...args: Parameters<Graffiti["discover"]>) {
          await replaceStream(id, graffiti.discover<{}>(...args));
        },
        async continueDiscover(
          id: string,
          ...args: Parameters<Graffiti["continueDiscover"]>
        ) {
          await replaceStream(id, graffiti.continueDiscover<{}>(...args));
        },
        streamNext(id: string) {
          return streams.get(id)?.next();
        },
        async streamReturn(id: string) {
          await streams.get(id)?.return({ cursor: "" });
          streams.delete(id);
        },
        async initialize() {
          await initialized;
          if (state.initialized || connectionDestroyed) return;
          // Forward live changes while replaying state and notifying initialized listeners.
          state.initialized = true;
          for (const session of sessions.values()) {
            await state.send("login", { session });
          }
          await state.send("initialized");
        },
        destroy() {
          window.setTimeout(() => void destroyConnection(), 0);
        },
      },
    });

    connections.add(state);
    void connection.promise.catch(() => void destroyConnection());

    async function replaceStream(
      id: string,
      stream: GraffitiObjectStream<{}>,
    ) {
      await streams.get(id)?.return({ cursor: "" });
      streams.set(id, stream);
    }

    async function destroyConnection() {
      if (connectionDestroyed) return;
      connectionDestroyed = true;
      state.initialized = false;
      connection.destroy();
      connections.delete(state);
      const openStreams = [...streams.values()];
      streams.clear();
      await Promise.allSettled(
        openStreams.map((stream) => stream.return({ cursor: "" })),
      );
    }

    return { destroy: destroyConnection };
  }

  async function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const type of sessionEventTypes) {
      graffiti.sessionEvents.removeEventListener(type, forward);
    }
    await Promise.allSettled([...connections].map(({ destroy }) => destroy()));
  }

  return { connect, destroy };
}
