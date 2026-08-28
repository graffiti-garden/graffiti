import {
  Graffiti,
  GraffitiErrorCursorExpired,
  GraffitiErrorForbidden,
  GraffitiErrorInvalidSchema,
  GraffitiErrorNotAcceptable,
  GraffitiErrorNotFound,
  GraffitiErrorSchemaMismatch,
  GraffitiErrorTooLarge,
  type GraffitiLoginEvent,
  type GraffitiMedia,
  type GraffitiObjectStream,
  type GraffitiLogoutEvent,
  type GraffitiPostMedia,
  type GraffitiSession,
} from "@graffiti-garden/api";
import {
  CallOptions,
  connect,
  type Connection,
  type RemoteProxy,
  WindowMessenger,
} from "penpal";
export type * from "@graffiti-garden/api";

type MethodsOf<T> = {
  [K in keyof T as T[K] extends (...args: any[]) => any ? K : never]: T[K];
};

type SerializedMedia = Omit<GraffitiMedia, "data"> & {
  data: { buffer: ArrayBuffer; type: string };
};

type SerializedPostMedia = Omit<GraffitiPostMedia, "data"> & {
  data: { buffer: ArrayBuffer; type: string };
};

type RPCMethods = MethodsOf<Graffiti> & {
  getMedia: (...args: Parameters<Graffiti["getMedia"]>) => Promise<SerializedMedia>;
  postMedia: (
    media: SerializedPostMedia,
    session: GraffitiSession,
  ) => Promise<string>;
  discover: (id: string, ...args: Parameters<Graffiti["discover"]>) => void;
  continueDiscover: (
    id: string,
    ...args: Parameters<Graffiti["continueDiscover"]>
  ) => void;
  streamNext: (id: string) => ReturnType<GraffitiObjectStream<{}>["next"]>;
  streamReturn: (id: string) => void;
  initialize: () => void;
  destroy: () => void;
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

const graffitiErrors = [
  GraffitiErrorCursorExpired,
  GraffitiErrorForbidden,
  GraffitiErrorInvalidSchema,
  GraffitiErrorNotAcceptable,
  GraffitiErrorNotFound,
  GraffitiErrorSchemaMismatch,
  GraffitiErrorTooLarge,
] as const;

let instance: GraffitiRpcClient | undefined;

export interface GraffitiRpcClientOptions {
  remoteWindow: Window;
  allowedOrigins?: (string | RegExp)[];
  channel?: string;
  timeout?: number;
}

/** A Graffiti implementation whose operations run in another iframe. */
// @ts-ignore Simple methods are attached programmatically in the constructor.
export class GraffitiRpcClient extends Graffiti {
  readonly sessionEvents = new EventTarget();

  private readonly connection!: Connection<RPCMethods>;
  private readonly remote_!: Promise<RemoteProxy<RPCMethods>>;
  private remoteClient?: RemoteProxy<RPCMethods>;
  private readonly sessions = new Map<string, GraffitiSession>();
  private initialized = false;
  private destroyed = false;

  constructor(options: GraffitiRpcClientOptions) {
    super();
    if (instance) {
      const existing = instance;
      window.setTimeout(() => existing.replayInitialization(), 0);
      return existing;
    }

    this.connection = connect<RPCMethods>({
      messenger: new WindowMessenger({
        remoteWindow: options.remoteWindow,
        // Sandboxed srcdoc frames have opaque origins.
        allowedOrigins: options.allowedOrigins ?? ["*"],
      }),
      channel: options.channel,
      timeout: options.timeout,
      methods: {
        sessionEvent: (type: string, detail: unknown) => {
          if (type === "login") {
            const login = detail as GraffitiLoginEvent["detail"];
            if (!login.error) this.sessions.set(login.session.actor, login.session);
          } else if (type === "logout") {
            const logout = detail as GraffitiLogoutEvent["detail"];
            if (!logout.error) this.sessions.delete(logout.actor);
          } else if (type === "initialized") {
            this.initialized = true;
            detail = undefined;
          }
          this.sessionEvents.dispatchEvent(new CustomEvent(type, { detail }));
        },
      },
    });
    this.remote_ = this.connection.promise.then((remote) => {
      const restored = restoreErrors(remote);
      this.remoteClient = restored;
      return restored;
    });
    window.setTimeout(() => {
      void this.remote_
        .then((remote) => remote.initialize())
        .catch(() => {
          // The iframe may be removed before the connection initializes.
        });
    }, 0);

    for (const method of simpleMethods) {
      (this as any)[method] = async (...args: unknown[]) => {
        const remote = await this.remote();
        const call = remote[method] as (...args: unknown[]) => unknown;
        return call(...clone(args));
      };
    }

    instance = this;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (instance === this) instance = undefined;
    void this.remoteClient?.destroy().catch(() => {});
    this.connection.destroy();
  }

  private replayInitialization() {
    if (this.destroyed) return;
    for (const session of this.sessions.values()) {
      this.sessionEvents.dispatchEvent(
        new CustomEvent("login", { detail: { session } }),
      );
    }
    if (this.initialized) {
      this.sessionEvents.dispatchEvent(
        new CustomEvent("initialized", { detail: undefined }),
      );
    }
  }

  getMedia: Graffiti["getMedia"] = async (...args) => {
    const result = await (await this.remote()).getMedia(...clone(args));
    return {
      ...result,
      data: new Blob([result.data.buffer], { type: result.data.type }),
    };
  };

  postMedia: Graffiti["postMedia"] = async (media, session) => {
    const buffer = await media.data.arrayBuffer();
    return (await this.remote()).postMedia(
      {
        ...clone(media),
        data: { buffer, type: media.data.type },
      },
      clone(session),
      new CallOptions({ transferables: [buffer] }),
    );
  };

  protected remoteStream(
    start: (remote: RemoteProxy<RPCMethods>, id: string) => Promise<void>,
  ): GraffitiObjectStream<{}> {
    const id = `graffiti-rpc-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    const remote = this.remote_;

    return (async function* () {
      const rpc = await remote;
      try {
        await start(rpc, id);
        while (true) {
          const result = await rpc.streamNext(id);
          if (result.done) return result.value;
          yield result.value;
        }
      } finally {
        await rpc.streamReturn(id);
      }
    })();
  }

  // @ts-ignore Graffiti schema inference is preserved at the public boundary.
  discover: Graffiti["discover"] = (...args) => {
    return this.remoteStream((remote, id) =>
      remote.discover(id, ...clone(args)),
    ) as any;
  };

  // @ts-ignore Graffiti schema inference is preserved at the public boundary.
  continueDiscover: Graffiti["continueDiscover"] = (...args) => {
    return this.remoteStream((remote, id) =>
      remote.continueDiscover(id, ...clone(args)),
    ) as any;
  };

  private remote() {
    if (this.destroyed) throw new Error("Graffiti RPC client has been destroyed.");
    return this.remote_;
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function restoreErrors(remote: RemoteProxy<RPCMethods>) {
  return new Proxy(remote, {
    get(target, property) {
      const method = Reflect.get(target, property) as unknown;
      return typeof method === "function"
        ? (...args: unknown[]) =>
            (method as (...args: unknown[]) => Promise<unknown>)(...args).catch(
              restoreError,
            )
        : method;
    },
  });
}

function restoreError(error: unknown): never {
  if (error instanceof Error) {
    const ErrorType = graffitiErrors.find(({ name }) => name === error.name);
    if (ErrorType) Object.setPrototypeOf(error, ErrorType.prototype);
  }
  throw error;
}
