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

type ClientMethods = {
  sessionEvent(type: string, detail?: unknown): Promise<void>;
};

type ConnectionState = {
  client?: ClientMethods;
  initialized: boolean;
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
  "login",
  "logout",
  "actorToHandle",
  "handleToActor",
] as const;

const sessionEventTypes = ["login", "logout", "initialized"] as const;

export interface GraffitiRpcConnectionOptions {
  remoteWindow: Window;
  allowedOrigins?: (string | RegExp)[];
  channel?: string;
  timeout?: number;
}

/** Expose one Graffiti implementation through any number of iframe connections. */
export function serveGraffiti(graffiti: Graffiti) {
  const sessions = new Map<string, GraffitiSession>();
  const connections = new Set<ConnectionState>();
  let sourceInitialized = false;
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
      sourceInitialized = true;
    }

    for (const connection of connections) {
      if (connection.initialized) {
        void connection.client
          ?.sessionEvent(event.type, event.detail)
          .catch(() => {});
      }
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
      destroy: destroyConnection,
    };
    const streams = new Map<string, GraffitiObjectStream<{}>>();
    let connectionDestroyed = false;

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
          for (const session of sessions.values()) {
            await state.client?.sessionEvent("login", { session });
          }
          if (sourceInitialized) {
            await state.client?.sessionEvent("initialized");
          }
          state.initialized = true;
        },
        destroy() {
          window.setTimeout(() => void destroyConnection(), 0);
        },
      },
    });

    connections.add(state);
    void connection.promise
      .then((remote) => {
        state.client = remote;
      })
      .catch(() => void destroyConnection());

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
