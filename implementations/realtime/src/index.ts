import {
  compileGraffitiObjectSchema,
  GraffitiErrorCursorExpired,
  GraffitiErrorForbidden,
  GraffitiErrorNotFound,
  GraffitiErrorSchemaMismatch,
  GraffitiErrorNotAcceptable,
  GraffitiErrorTooLarge,
  isMediaAcceptable,
  maskGraffitiObject,
  normalizeGraffitiReadOptions,
  unpackObjectUrl,
  type Graffiti,
  type GraffitiObjectBase,
  type GraffitiObject,
  type GraffitiObjectStream,
  type GraffitiReadOptions,
  type GraffitiSession,
  type JSONSchema,
} from "@graffiti-garden/api";
import { GraffitiRuntimeTypes } from "@graffiti-garden/wrapper-runtime-types";
import { Channel, type Change } from "./channel.js";

type Entry = Change & { sequence: number };
type Subscription = { connection: Channel; entries: Map<string, Entry>; errors: Error[] };
type Cursor = {
  realtime: 1;
  instance: string;
  channels: string[];
  schema: JSONSchema;
  actor: string | null;
  sequence: number;
  storage: string;
};

/**
 * Add live peer delivery to a Graffiti implementation. Applications still use
 * post/get/delete/discover; the underlying implementation owns persistence and
 * flush. Logged-in readers exchange changes through direct Trystero connections.
 * Anonymous readers and runtimes without WebRTC use the underlying implementation.
 *
 * This first implementation uses one room per channel and account. It keeps rooms
 * until logout or close(), so repeated discovery can reuse their connections.
 */
// @ts-ignore JSON schema inference exceeds TypeScript's structural comparison depth.
export class GraffitiRealtime extends GraffitiRuntimeTypes {
  private subscriptions = new Map<string, Subscription>();
  private sequence = 0;
  private instance = crypto.randomUUID();
  private closed = false;
  private logoutListener = (event: Event) => {
    const actor = (event as CustomEvent).detail?.actor;
    for (const [key, subscription] of this.subscriptions) {
      if (subscription.connection.session.actor !== actor) continue;
      this.subscriptions.delete(key);
      void subscription.connection.close().catch(console.error);
    }
  };

  constructor(graffiti: Graffiti) {
    super(graffiti);
    this.sessionEvents.addEventListener("logout", this.logoutListener);
  }

  private subscribe(channel: string, session?: GraffitiSession | null) {
    if (!session || this.closed || typeof RTCPeerConnection === "undefined") return;
    const key = JSON.stringify([session.actor, channel]);
    let subscription = this.subscriptions.get(key);
    if (!subscription) {
      const entries = new Map<string, Entry>();
      const errors: Error[] = [];
      const connection = new Channel(this.graffiti, channel, session, change => {
        const previous = entries.get(change.object.url);
        // Objects are immutable and deletion is final; snapshots arriving late
        // must not revive an object whose deletion was already received.
        if (previous && (previous.tombstone || !change.tombstone)) return;
        entries.set(change.object.url, { ...change, sequence: ++this.sequence });
      }, error => {
        errors.push(error instanceof Error ? error : new Error(String(error)));
        // Diagnostics must not accumulate indefinitely if no query is consuming them.
        if (errors.length > 16) errors.shift();
      });
      subscription = { connection, entries, errors };
      this.subscriptions.set(key, subscription);
    }
    return subscription;
  }

  private send(object: GraffitiObjectBase, session: GraffitiSession, tombstone?: true) {
    for (const channel of object.channels) {
      const subscription = this.subscribe(channel, session);
      if (!subscription) continue;
      const change = { object, ...(tombstone ? { tombstone } : {}) };
      subscription.entries.set(object.url, { ...change, sequence: ++this.sequence });
      subscription.connection.send(change);
    }
  }

  post: Graffiti["post"] = async (...args) => {
    const object = await this.graffiti.post(...args);
    try { this.send(object, args[1]); } catch (error) { console.error("Could not open realtime delivery:", error); }
    return object;
  };

  delete: Graffiti["delete"] = async (...args) => {
    const object = await this.graffiti.delete(...args);
    try { this.send(object, args[1], true); } catch (error) { console.error("Could not send realtime deletion:", error); }
    return object;
  };

  get = async <Schema extends JSONSchema>(
    ...[url, schema, options]: Parameters<typeof Graffiti.prototype.get<Schema>>
  ): Promise<GraffitiObject<Schema>> => {
    const { session, refresh = false } = normalizeGraffitiReadOptions(options);
    const key = unpackObjectUrl(url);
    const validate = await compileGraffitiObjectSchema(schema);
    let cached: GraffitiObjectBase | undefined;
    for (const subscription of this.subscriptions.values()) {
      if (subscription.connection.session.actor !== session?.actor) continue;
      const entry = subscription.entries.get(key);
      if (entry?.tombstone) throw new GraffitiErrorNotFound("Object has been deleted");
      if (entry) cached = maskGraffitiObject(entry.object, [], session.actor);
    }
    if (cached && !refresh) {
      if (!validate(cached)) throw new GraffitiErrorSchemaMismatch("Object does not match the supplied schema");
      return structuredClone(cached);
    }
    return this.graffiti.get<Schema>(url, schema, options);
  };

  getMedia: Graffiti["getMedia"] = async (url, accept, options) => {
    const { session, refresh = false } = normalizeGraffitiReadOptions(options);
    if (accept.maxBytes !== undefined && (!Number.isSafeInteger(accept.maxBytes) || accept.maxBytes < 0)) {
      throw new TypeError("maxBytes must be a nonnegative safe integer");
    }
    for (const subscription of this.subscriptions.values()) {
      if (subscription.connection.session.actor !== session?.actor) continue;
      const media = await subscription.connection.getMedia(url, accept, refresh);
      if (!media) continue;
      if (accept.maxBytes !== undefined && media.data.size > accept.maxBytes) throw new GraffitiErrorTooLarge("File size exceeds limit");
      if (accept.types && !isMediaAcceptable(media.data.type, accept.types)) throw new GraffitiErrorNotAcceptable("Unacceptable media type");
      return media;
    }
    return this.graffiti.getMedia(url, accept, options);
  };

  discover: Graffiti["discover"] = (channels, schema, options) =>
    this.discoverCombined(channels, schema, normalizeGraffitiReadOptions(options));

  continueDiscover = <Schema extends JSONSchema>(
    cursor: string, options?: GraffitiReadOptions | GraffitiSession | null,
  ): GraffitiObjectStream<Schema> => this.continueCombined<Schema>(cursor, options);

  private async *continueCombined<Schema extends JSONSchema>(
    cursor: string, options?: GraffitiReadOptions | GraffitiSession | null,
  ): GraffitiObjectStream<Schema> {
    const parsed = this.parseCursor(cursor);
    const normalized = normalizeGraffitiReadOptions(options);
    if (parsed.actor !== (normalized.session?.actor ?? null)) {
      throw new GraffitiErrorForbidden("Cursor belongs to another session");
    }
    return yield* this.discoverCombined(parsed.channels, parsed.schema as Schema, normalized, parsed);
  }

  private parseCursor(cursor: string): Cursor {
    try {
      const parsed = JSON.parse(cursor) as Cursor;
      if (parsed.realtime !== 1 || !Array.isArray(parsed.channels) ||
          !parsed.channels.every(channel => typeof channel === "string") ||
          typeof parsed.storage !== "string" || !Number.isSafeInteger(parsed.sequence)) throw new Error();
      return parsed;
    } catch { throw new GraffitiErrorCursorExpired("Invalid realtime cursor"); }
  }

  private async *discoverCombined<Schema extends JSONSchema>(
    channels: string[], schema: Schema, options: GraffitiReadOptions, cursor?: Cursor,
  ): GraffitiObjectStream<Schema> {
    const validate = await compileGraffitiObjectSchema(schema);
    const subscriptions = channels.map(channel => this.subscribe(channel, options.session))
      .filter((subscription): subscription is Subscription => subscription !== undefined);
    const iterator = cursor
      ? this.graffiti.continueDiscover<Schema>(cursor.storage, options)
      : this.graffiti.discover(channels, schema, options);
    let sequence = cursor?.instance === this.instance ? cursor.sequence : 0;
    const seen = new Map<string, boolean>();
    let next = iterator.next();
    // Storage can fail while the consumer is paused at a live result's yield.
    // Handle that rejection now; awaiting the original promise still throws it.
    void next.catch(() => {});
    try {
      while (true) {
        const through = this.sequence;
        const live = new Map<string, Entry>();
        for (const subscription of subscriptions) {
          for (const error of subscription.errors.splice(0)) yield { error, origin: "graffiti:realtime" };
          for (const entry of subscription.entries.values()) {
            const previous = live.get(entry.object.url);
            live.set(entry.object.url, previous ? {
              object: { ...entry.object, channels: [...new Set([...previous.object.channels, ...entry.object.channels])] },
              sequence: Math.max(previous.sequence, entry.sequence),
              ...(previous.tombstone || entry.tombstone ? { tombstone: true } : {}),
            } : entry);
          }
        }
        for (const entry of live.values()) {
          if (entry.sequence <= sequence || entry.sequence > through) continue;
          const object = maskGraffitiObject(entry.object, channels, options.session?.actor);
          if (!validate(object) || seen.get(object.url) === (entry.tombstone === true)) continue;
          seen.set(object.url, entry.tombstone === true);
          yield entry.tombstone ? { object: structuredClone(object), tombstone: true } : { object: structuredClone(object) };
        }
        sequence = through;
        // Poll the small live cache while a storage discovery page is in flight.
        // This keeps the ordinary finite discovery API without a second event API.
        let timer: ReturnType<typeof setTimeout> | undefined;
        const result = subscriptions.length
          ? await Promise.race([next, new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), 50); })])
          : await next;
        clearTimeout(timer);
        if (!result) continue;
        if (result.done) {
          // Avoid a tight continuation loop when the storage cache is immediate.
          if (subscriptions.length) await new Promise(resolve => setTimeout(resolve, 50));
          return { cursor: JSON.stringify({ realtime: 1, instance: this.instance, channels, schema,
            actor: options.session?.actor ?? null, sequence, storage: result.value.cursor } satisfies Cursor) };
        }
        next = iterator.next();
        void next.catch(() => {});
        const entry = result.value;
        if (entry.error) { yield entry; continue; }
        if (entry.tombstone) {
          // A deletion learned from storage is just as final as one from a peer.
          for (const subscription of this.subscriptions.values()) {
            if (subscription.connection.session.actor !== options.session?.actor) continue;
            const previous = subscription.entries.get(entry.object.url);
            if (previous && !previous.tombstone) subscription.entries.set(entry.object.url,
              { ...previous, tombstone: true, sequence: ++this.sequence });
          }
        }
        const knownDeletion = subscriptions.some(subscription => subscription.entries.get(entry.object.url)?.tombstone);
        if (knownDeletion && !entry.tombstone) continue;
        if (seen.get(entry.object.url) === (entry.tombstone === true)) continue;
        seen.set(entry.object.url, entry.tombstone === true);
        yield entry;
      }
    } finally { await iterator.return({ cursor: "" }); }
  }

  /** Release peer connections and signaling. Accepted writes remain with the underlying implementation. */
  async close() {
    this.closed = true;
    this.sessionEvents.removeEventListener("logout", this.logoutListener);
    const subscriptions = [...this.subscriptions.values()];
    this.subscriptions.clear();
    await Promise.all(subscriptions.map(subscription => subscription.connection.close()));
  }
}
