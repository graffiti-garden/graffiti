import type {
  Graffiti,
  GraffitiObjectBase,
  GraffitiObjectStream,
  GraffitiSession,
  JSONSchema,
} from "@graffiti-garden/api";
import {
  createTopicStrategy,
  type BaseRoomConfig,
  type StrategyMessage,
} from "@trystero-p2p/core";

export const PROTOCOL = "graffiti-realtime/v1";
const SIGNAL_TTL = 120_000;
const signalSchema = () =>
  ({
    properties: {
      value: {
        properties: {
          protocol: { const: PROTOCOL },
          payload: { type: ["string", "object"] },
          expires: { type: "number", minimum: Date.now() - SIGNAL_TTL },
        },
        required: ["protocol", "payload", "expires"],
      },
    },
  }) as const satisfies JSONSchema;
type SignalSchema = ReturnType<typeof signalSchema>;

/** @internal Graffiti records and cursor polling for Trystero's two topics. */
export class GraffitiRelay {
  private closed = false;
  private records = new Map<
    string,
    ReturnType<typeof setTimeout> | undefined
  >();
  private subscriptions = new Set<() => void>();

  constructor(
    private graffiti: Graffiti,
    private session: GraffitiSession,
    private report: (error: unknown) => void,
  ) {}

  async post(
    value: GraffitiObjectBase["value"],
    channels: string[],
    ttl?: number,
  ) {
    if (this.closed) throw new Error("The realtime room has been left.");
    const object = await this.graffiti.post({ value, channels }, this.session);
    // Graffiti requests are not abortable; clean up a write that finishes late.
    if (this.closed) {
      await this.remove(object.url);
      throw new Error("The realtime room has been left.");
    }
    this.records.set(
      object.url,
      ttl ? setTimeout(() => void this.remove(object.url), ttl) : undefined,
    );
    return object;
  }

  async publish(topic: string, message: StrategyMessage) {
    try {
      // Topic strategies exchange JSON; Graffiti performs serialization.
      await this.post(
        {
          protocol: PROTOCOL,
          payload: message,
          expires: Date.now() + SIGNAL_TTL,
        },
        [`realtime:${topic}`],
        SIGNAL_TTL,
      );
    } catch (error) {
      if (!this.closed) this.report(error);
      throw error;
    }
  }

  subscribe(
    topic: string,
    receive: (topic: string, message: StrategyMessage) => unknown,
  ) {
    if (this.closed) return () => {};
    let stopped = false;
    let cursor: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let iterator: GraffitiObjectStream<SignalSchema> | undefined;
    const stop = () => {
      stopped = true;
      clearTimeout(timer);
      this.subscriptions.delete(stop);
      void iterator?.return({ cursor: "" }).catch(this.report);
    };
    const poll = async () => {
      let delay = 1000;
      try {
        iterator =
          cursor !== undefined
            ? this.graffiti.continueDiscover<SignalSchema>(cursor, this.session)
            : this.graffiti.discover<SignalSchema>(
                [`realtime:${topic}`],
                signalSchema(),
                this.session,
              );
        while (!stopped) {
          const next = await iterator.next();
          if (stopped) return;
          if (next.done) {
            cursor = next.value.cursor;
            break;
          }
          if (next.value.error) {
            this.report(next.value.error);
            continue;
          }
          if (next.value.tombstone) continue;
          const value = next.value.object.value;
          if (value.expires <= Date.now()) continue;
          void Promise.resolve()
            .then(() => {
              if (!stopped) return receive(topic, value.payload);
            })
            .catch(this.report);
        }
      } catch (error) {
        if (stopped) return;
        cursor = undefined;
        if (
          error instanceof Error &&
          error.name === "GraffitiErrorCursorExpired"
        ) {
          delay = 0;
        } else {
          delay = 5000;
          this.report(error);
        }
      } finally {
        if (!stopped) timer = setTimeout(() => void poll(), delay);
      }
    };
    this.subscriptions.add(stop);
    void poll();
    return stop;
  }

  private async remove(url: string) {
    clearTimeout(this.records.get(url));
    this.records.delete(url);
    try {
      await this.graffiti.delete(url, this.session);
    } catch (error) {
      this.report(error);
    }
  }

  async close() {
    this.closed = true;
    for (const stop of this.subscriptions) stop();
    await Promise.all([...this.records.keys()].map((url) => this.remove(url)));
  }
}

interface Config extends BaseRoomConfig {
  relay: GraffitiRelay;
}
export function joinTransport(config: Config, channel: string) {
  // Each room instance gets a fresh endpoint and signaling inbox.
  return createTopicStrategy<GraffitiRelay, Config>({
    init: ({ relay }) => relay,
    subscribeTopic: (relay, topic, receive) => relay.subscribe(topic, receive),
    publishTopic: (relay, topic, message) => relay.publish(topic, message),
  })(config, channel);
}
