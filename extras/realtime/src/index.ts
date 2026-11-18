import {
  compileGraffitiObjectSchema,
  type Graffiti,
  type GraffitiSession,
  type JSONSchema,
} from "@graffiti-garden/api";
import type { FromSchema } from "json-schema-to-ts";
import { scale } from "@trystero-p2p/core";
import type {
  JsonValue,
  MessageAction,
  PeerJoinContext,
  RequestAction,
  Room,
} from "@trystero-p2p/core";
import { GraffitiRelay, joinTransport, PROTOCOL } from "./signaling.js";

/** Application-defined message contents or stream metadata. */
export type RealtimeValue = { [key: string]: JsonValue };
export type Unsubscribe = () => void;

/** One verified Graffiti actor's live tab/device. */
export interface RealtimePeer {
  readonly actor: string;
  readonly peerId: string;
}

/** A JSON object with its authenticated sender, narrowed by a subscription schema. */
export type RealtimeMessage<Schema extends JSONSchema = {}> = RealtimePeer & {
  value: RealtimeValue;
} & (JSONSchema extends Schema
    ? unknown
    : FromSchema<
        Schema & {
          type: "object";
          properties: { value: { type: "object" } };
        }
      >);

// The compiler validates the supplied schema; only its types assume Graffiti objects.
const compileJSONSchema = compileGraffitiObjectSchema as (
  schema: JSONSchema,
) => Promise<(data: unknown) => boolean>;

function isObject(value: unknown): value is RealtimeValue {
  return Object.prototype.toString.call(value) === "[object Object]";
}

/** Live broadcasts and media on a channel. Register listeners immediately after construction. */
export class GraffitiRealtime {
  private self: Promise<RealtimePeer>;
  private transport: Room;
  private relay: GraffitiRelay;
  private data: MessageAction<RealtimeValue>;
  private identity: RequestAction<null, string>;
  private peers = new Map<string, Promise<RealtimePeer | undefined>>();
  private streams = new Set<MediaStream>();
  private leaving?: Promise<void>;
  private leaves = new Set<(peer: RealtimePeer) => unknown>();
  private errors = new Set<(error: Error) => unknown>();

  constructor(
    private graffiti: Graffiti,
    channel: string,
    private session: GraffitiSession,
  ) {
    if (!channel || typeof channel !== "string" || !session?.actor) {
      throw new TypeError("A channel and logged-in session are required.");
    }
    this.relay = new GraffitiRelay(graffiti, this.session, (error) =>
      this.report(error),
    );
    this.transport = joinTransport(
      {
        appId: PROTOCOL,
        identity: "none",
        password: channel,
        relay: this.relay,
        use: [scale()],
      },
      channel,
    );
    this.data = this.transport.makeAction<RealtimeValue>("message");
    this.identity = this.transport.makeAction<null, string>("identity", {
      kind: "request",
    });

    const binding = this.transport
      .getSelf()
      .then(async ({ peerId, userId }) => {
        const { actor, url } = await this.relay.post(
          { protocol: PROTOCOL, kind: "identity", peerId, userId },
          [],
        );
        return { actor, peerId, url };
      });
    this.self = binding.then(({ actor, peerId }) =>
      Object.freeze({ actor, peerId }),
    );
    this.identity.onRequest(async () => (await binding).url);

    this.transport.onPeerJoin((context) => this.connect(context));
    this.transport.onPeerLeave(({ peerId }) => this.disconnect(peerId));
    // Trystero holds incoming messages until actor verification completes.
    this.data.onReceive(async ({ peerId }) => {
      const peer = this.peers.get(peerId);
      return (
        Boolean(await peer) && !this.leaving && this.peers.get(peerId) === peer
      );
    });
    void this.self.catch((error) => {
      if (!this.leaving) {
        this.report(error);
        void this.leave();
      }
    });
  }

  private async verify({
    peerId,
    userId,
  }: PeerJoinContext): Promise<RealtimePeer> {
    const url = await this.identity.request(null, {
      target: peerId,
      timeoutMs: 30_000,
    });
    // Graffiti validates the binding against the IDs authenticated by Trystero.
    const object = await this.graffiti.get(
      url,
      {
        properties: {
          value: {
            properties: {
              protocol: { const: PROTOCOL },
              kind: { const: "identity" },
              peerId: { const: peerId },
              userId: { const: userId },
            },
            required: ["protocol", "kind", "peerId", "userId"],
          },
        },
        required: ["value"],
      },
      this.session,
    );
    return Object.freeze({ actor: object.actor, peerId });
  }

  private connect(context: PeerJoinContext) {
    const peer = this.verify(context)
      .then((verified) => {
        if (!this.leaving && this.peers.get(context.peerId) === peer)
          return verified;
      })
      .catch((error) => {
        if (this.peers.get(context.peerId) === peer) {
          this.peers.delete(context.peerId);
          this.report(error);
        }
        return undefined;
      });
    this.peers.set(context.peerId, peer);
    for (const stream of this.streams) {
      void this.transport
        .addStream(stream, { target: context.peerId })
        .catch((error) => this.report(error));
    }
  }

  private disconnect(peerId: string) {
    const peer = this.peers.get(peerId);
    this.peers.delete(peerId);
    if (peer)
      for (const handler of this.leaves) {
        void peer
          .then((verified) => {
            if (verified && this.leaves.has(handler)) return handler(verified);
          })
          .catch((error) => this.report(error));
      }
  }

  private async open() {
    if (this.leaving) throw new Error("The realtime room has been left.");
    await this.self;
    if (this.leaving) throw new Error("The realtime room has been left.");
  }

  private report(error: unknown) {
    const normalized =
      error instanceof Error ? error : new Error(String(error));
    for (const handler of this.errors)
      queueMicrotask(() => {
        if (this.errors.has(handler)) handler(normalized);
      });
  }

  /** Retrieve the local identity once published. Other peers arrive asynchronously. */
  getSelf(): Promise<RealtimePeer> {
    return this.self;
  }

  onMessage<Schema extends JSONSchema>(
    schema: Schema,
    handler: (message: RealtimeMessage<Schema>) => unknown,
  ): Unsubscribe {
    const controller = new AbortController();
    const validation = compileJSONSchema(schema).catch((error) =>
      this.report(error),
    );
    this.data.onMessage(
      async (value, { peerId }) => {
        if (!isObject(value)) return;
        const pending = this.peers.get(peerId);
        const [peer, validate] = await Promise.all([pending, validation]);
        if (
          controller.signal.aborted ||
          this.leaving ||
          !peer ||
          this.peers.get(peerId) !== pending
        )
          return;
        const message = Object.freeze({ value, ...peer });
        if (validate?.(message))
          return handler(message as unknown as RealtimeMessage<Schema>);
      },
      { signal: controller.signal },
    );
    return () => controller.abort();
  }

  onStream<Schema extends JSONSchema>(
    schema: Schema,
    handler: (
      stream: MediaStream,
      metadata: RealtimeMessage<Schema>,
    ) => unknown,
  ): Unsubscribe {
    const controller = new AbortController();
    const validation = compileJSONSchema(schema).catch((error) =>
      this.report(error),
    );
    this.transport.onPeerStream(
      async (stream, { peerId, metadata = {} }) => {
        if (!isObject(metadata)) return;
        const pending = this.peers.get(peerId);
        const [peer, validate] = await Promise.all([pending, validation]);
        if (
          controller.signal.aborted ||
          this.leaving ||
          !peer ||
          this.peers.get(peerId) !== pending
        )
          return;
        const message = Object.freeze({ value: metadata, ...peer });
        if (validate?.(message))
          return handler(stream, message as unknown as RealtimeMessage<Schema>);
      },
      { signal: controller.signal },
    );
    return () => controller.abort();
  }

  onPeerJoin(handler: (peer: RealtimePeer) => unknown): Unsubscribe {
    const controller = new AbortController();
    this.transport.onPeerJoin(
      async ({ peerId }) => {
        const pending = this.peers.get(peerId);
        const peer = await pending;
        if (
          !controller.signal.aborted &&
          !this.leaving &&
          peer &&
          this.peers.get(peerId) === pending
        )
          return handler(peer);
      },
      { signal: controller.signal },
    );
    return () => controller.abort();
  }

  onPeerLeave(handler: (peer: RealtimePeer) => unknown): Unsubscribe {
    const callback = (peer: RealtimePeer) => handler(peer);
    this.leaves.add(callback);
    return () => {
      this.leaves.delete(callback);
    };
  }

  onError(handler: (error: Error) => unknown): Unsubscribe {
    const callback = (error: Error) => handler(error);
    this.errors.add(callback);
    const unsubscribe = this.transport.onError((error) =>
      handler(new Error(error.message, { cause: error })),
    );
    return () => {
      this.errors.delete(callback);
      unsubscribe();
    };
  }

  /** Broadcast to the room. No offline queue or recipient acknowledgment. */
  async send(value: RealtimeValue) {
    await this.open();
    if (!isObject(value))
      throw new TypeError("Message values must be JSON objects.");
    await this.data.send(value);
  }

  /** Publish to current and future peers. Call again after changing metadata or tracks. */
  async addStream(stream: MediaStream, value: RealtimeValue = {}) {
    await this.open();
    if (!isObject(value))
      throw new TypeError("Stream metadata must be a JSON object.");
    this.streams.add(stream);
    await this.transport.addStream(stream, { metadata: value });
  }

  /** Stop publication without stopping caller-owned media tracks. */
  async removeStream(stream: MediaStream) {
    await this.open();
    this.streams.delete(stream);
    this.transport.removeStream(stream);
  }

  /** Close peers and polling, then attempt to delete this room's Graffiti records. */
  leave(): Promise<void> {
    if (!this.leaving) {
      // Assign before invoking callbacks so a leave listener can call leave().
      this.leaving = Promise.resolve().then(async () => {
        this.streams.clear();
        for (const peerId of this.peers.keys()) this.disconnect(peerId);
        await Promise.all([this.transport.leave(), this.relay.close()]);
        this.leaves.clear();
        this.errors.clear();
      });
    }
    return this.leaving;
  }
}
