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
  type GraffitiObject,
  type GraffitiObjectStream,
  type GraffitiReadOptions,
  type GraffitiSession,
  type JSONSchema,
} from "@graffiti-garden/api";
import { GraffitiRuntimeTypes } from "@graffiti-garden/wrapper-runtime-types";
import { Channel, type Change } from "./channel.js";

const ACTIVE_INTERVAL = 1000;
const LIVE_WINDOW = 5000;
const MAX_LIVE_ENTRIES = 1024;
type Entry = Change & { sequence: number; received: number };
type Subscription = { used: number; readers: number; room?: Channel };
type Account = {
  connections: Map<string, Subscription>;
  entries: Map<string, Entry>;
  expiredThrough: number;
  changed: ReturnType<typeof Promise.withResolvers<void>>;
  error?: Error;
};
type Cursor = {
  realtime: 1;
  instance: string;
  channels: string[];
  schema: JSONSchema;
  actor: string | null;
  sequence: number;
  storage: string;
  expires?: number;
};

/**
 * Add live peer delivery to a Graffiti implementation. The underlying
 * implementation owns persistence and flush; applications use the usual API.
 * Frequent activity opens a room per channel. Live history and idle rooms expire;
 * ordinary reads keep the underlying implementation's cursor lifetime.
 * Anonymous readers and runtimes without WebRTC use the underlying implementation.
 */
// @ts-ignore JSON schema inference exceeds TypeScript's structural comparison depth.
export class GraffitiRealtime extends GraffitiRuntimeTypes {
  private accounts = new Map<string, Account>();
  private sequence = 0;
  private instance = crypto.randomUUID();
  private closed = false;
  private timer?: ReturnType<typeof setInterval>;
  private logoutListener = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (detail?.error) return;
    const account = this.accounts.get(detail?.actor);
    if (!account) return;
    this.accounts.delete(detail.actor);
    void this.closeAccount(account).catch(console.error);
  };

  constructor(graffiti: Graffiti) {
    super(graffiti);
    this.sessionEvents.addEventListener("logout", this.logoutListener);
  }

  private subscribe(channels: string[], session?: GraffitiSession | null) {
    if (!session || this.closed || typeof RTCPeerConnection === "undefined") return;
    const now = Date.now();
    this.sweep(now);
    const account: Account = this.accounts.get(session.actor) ?? {
      connections: new Map(), entries: new Map(), expiredThrough: 0, changed: Promise.withResolvers<void>(),
    };
    this.accounts.set(session.actor, account);
    for (const channel of channels) {
      const previous = account.connections.get(channel);
      const subscription = previous ?? { used: now, readers: 0 };
      account.connections.set(channel, subscription);
      if (!subscription.room && previous && now - previous.used <= ACTIVE_INTERVAL) {
        subscription.room = new Channel(this.graffiti, channel, session,
          change => this.remember(account, change),
          error => {
            account.error = error instanceof Error ? error : new Error(String(error));
            this.wake(account);
          },
          () => { this.trim(account); return account.entries.values(); },
        );
      }
      subscription.used = now;
    }
    this.timer ??= setInterval(() => this.sweep(Date.now()), ACTIVE_INTERVAL);
    return account;
  }

  private trim(account: Account, now = Date.now()) {
    // Entries stay ordered by their last change, so pruning stops at the first
    // current entry. Deletions need only this window, not a permanent tombstone.
    for (const [url, entry] of account.entries) {
      if (entry.received > now - LIVE_WINDOW && account.entries.size <= MAX_LIVE_ENTRIES) break;
      account.entries.delete(url);
      account.expiredThrough = Math.max(account.expiredThrough, entry.sequence);
    }
  }

  private sweep(now: number) {
    for (const [actor, account] of this.accounts) {
      this.trim(account, now);
      for (const [channel, subscription] of account.connections) {
        if (subscription.readers || now - subscription.used <= (subscription.room ? LIVE_WINDOW : ACTIVE_INTERVAL)) continue;
        account.connections.delete(channel);
        void subscription.room?.close().catch(console.error);
      }
      if (!account.connections.size) {
        account.entries.clear();
        this.accounts.delete(actor);
        this.wake(account);
      }
    }
    if (!this.accounts.size) { clearInterval(this.timer); this.timer = undefined; }
  }

  private wake(account: Account) {
    const changed = account.changed;
    account.changed = Promise.withResolvers<void>();
    changed.resolve();
  }

  /** Merge permitted channel views once, and keep deletions final. */
  private remember(account: Account, change: Change) {
    this.trim(account);
    const previous = account.entries.get(change.object.url);
    const channels = [...new Set([
      ...(previous?.object.channels ?? []),
      ...change.object.channels,
    ])];
    const tombstone = previous?.tombstone || change.tombstone;
    if (previous && previous.tombstone === tombstone && channels.length === previous.object.channels.length) return;
    account.entries.delete(change.object.url);
    account.entries.set(change.object.url, {
      object: { ...(previous?.object ?? change.object), channels },
      ...(tombstone ? { tombstone } : {}),
      sequence: ++this.sequence,
      received: Date.now(),
    });
    this.trim(account);
    this.wake(account);
  }

  private send(change: Change, session: GraffitiSession) {
    try {
      const account = this.subscribe(change.object.channels, session);
      if (!account) return;
      const rooms = change.object.channels.flatMap(channel => account.connections.get(channel)?.room ?? []);
      if (!rooms.length) return;
      this.remember(account, change);
      for (const room of rooms) room.send(change);
    } catch (error) {
      // The underlying write was accepted even if realtime setup failed.
      console.error("Could not open realtime delivery:", error);
    }
  }

  post: Graffiti["post"] = async (...args) => {
    const object = await this.graffiti.post(...args);
    this.send({ object: structuredClone(object) }, args[1]);
    return object;
  };

  delete: Graffiti["delete"] = async (...args) => {
    const object = await this.graffiti.delete(...args);
    this.send({ object: structuredClone(object), tombstone: true }, args[1]);
    return object;
  };

  get = async <Schema extends JSONSchema>(
    ...[url, schema, options]: Parameters<typeof Graffiti.prototype.get<Schema>>
  ): Promise<GraffitiObject<Schema>> => {
    const { session, refresh = false } = normalizeGraffitiReadOptions(options);
    const validate = await compileGraffitiObjectSchema(schema);
    const account = session && this.accounts.get(session.actor);
    if (account) this.trim(account);
    const entry = account && account.entries.get(unpackObjectUrl(url));
    if (entry && !refresh) {
      if (entry.tombstone) throw new GraffitiErrorNotFound("Object has been deleted");
      const object = maskGraffitiObject(entry.object, [], session.actor);
      if (!validate(object)) throw new GraffitiErrorSchemaMismatch("Object does not match the supplied schema");
      return structuredClone(object);
    }
    return this.graffiti.get<Schema>(url, schema, options);
  };

  getMedia: Graffiti["getMedia"] = async (url, accept, options) => {
    const { session, refresh = false } = normalizeGraffitiReadOptions(options);
    if (accept.maxBytes !== undefined && (!Number.isSafeInteger(accept.maxBytes) || accept.maxBytes < 0)) {
      throw new TypeError("maxBytes must be a nonnegative safe integer");
    }
    const account = session && this.accounts.get(session.actor);
    for (const connection of account?.connections.values() ?? []) {
      if (!connection.room) continue;
      connection.used = Date.now();
      const media = await connection.room.getMedia(url, accept, refresh);
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
    let parsed: Cursor;
    try {
      parsed = JSON.parse(cursor);
      if (parsed.realtime !== 1 ||
          !Array.isArray(parsed.channels) ||
          !parsed.channels.every(channel => typeof channel === "string") ||
          typeof parsed.storage !== "string" ||
          !Number.isSafeInteger(parsed.sequence) ||
          (parsed.expires !== undefined && !Number.isFinite(parsed.expires))) {
        throw new Error();
      }
    } catch { throw new GraffitiErrorCursorExpired("Invalid realtime cursor"); }
    const normalized = normalizeGraffitiReadOptions(options);
    if (parsed.actor !== (normalized.session?.actor ?? null)) {
      throw new GraffitiErrorForbidden("Cursor belongs to another session");
    }
    if (parsed.expires !== undefined && (parsed.instance !== this.instance || parsed.expires <= Date.now())) {
      throw new GraffitiErrorCursorExpired("Live discovery expired; restart discovery");
    }
    return yield* this.discoverCombined(parsed.channels, parsed.schema as Schema, normalized, parsed);
  }

  private async *discoverCombined<Schema extends JSONSchema>(
    channels: string[], schema: Schema, options: GraffitiReadOptions, cursor?: Cursor,
  ): GraffitiObjectStream<Schema> {
    const validate = await compileGraffitiObjectSchema(schema);
    const subscribed = this.subscribe(channels, options.session);
    const active = channels.flatMap(channel => {
      const subscription = subscribed?.connections.get(channel);
      return subscription?.room ? [subscription] : [];
    });
    const account = active.length ? subscribed : undefined;
    for (const subscription of active) subscription.readers++;
    const iterator = cursor
      ? this.graffiti.continueDiscover<Schema>(cursor.storage, options)
      : this.graffiti.discover(channels, schema, options);
    let sequence = cursor?.expires !== undefined ? cursor.sequence : (account?.expiredThrough ?? 0);
    const seen = new Map<string, boolean>();
    const alreadySeen = (url: string, tombstone: boolean) => {
      if (!account) return false;
      if (seen.get(url) === tombstone) return true;
      seen.set(url, tombstone);
      // A slow storage page must not accumulate the whole call's live history.
      if (seen.size > MAX_LIVE_ENTRIES) seen.delete(seen.keys().next().value!);
      return false;
    };
    let storageReady = false;
    const readStorage = () => {
      storageReady = false;
      const next = iterator.next().then(async result => {
        // Pace empty continuations without delaying live delivery: changes can
        // still wake the loop while this finite storage page finishes.
        if (result.done && account) await new Promise(resolve => setTimeout(resolve, 50));
        return result;
      }).finally(() => {
        storageReady = true;
        if (account) this.wake(account);
      });
      // A storage request can fail while the consumer is paused at a yield.
      void next.catch(() => {});
      return next;
    };
    let next = readStorage();
    try {
      while (true) {
        if (account) {
          this.trim(account);
          if (sequence < account.expiredThrough) throw new GraffitiErrorCursorExpired("Live discovery fell behind; restart discovery");
        }
        const changed = account?.changed.promise;
        const through = this.sequence;
        if (account?.error) {
          const error = account.error;
          delete account.error;
          yield { error, origin: "graffiti:realtime" };
        }
        for (const entry of account?.entries.values() ?? []) {
          if (entry.sequence <= sequence || entry.sequence > through ||
              !entry.object.channels.some(channel => channels.includes(channel))) continue;
          const object = maskGraffitiObject(entry.object, channels, options.session?.actor);
          if (!validate(object) || alreadySeen(object.url, entry.tombstone === true)) continue;
          yield entry.tombstone ? { object: structuredClone(object), tombstone: true } : { object: structuredClone(object) };
        }
        sequence = through;
        // Keep receiving live changes while a finite storage page is in flight.
        // One completion callback per storage request. Repeated Promise.race
        // would retain a callback for every frame until that request finishes.
        if (changed && !storageReady) { await changed; continue; }
        const result = await next;
        if (result.done) {
          return { cursor: JSON.stringify({
            realtime: 1,
            instance: this.instance,
            channels,
            schema,
            actor: options.session?.actor ?? null,
            sequence,
            storage: result.value.cursor,
            ...(account ? { expires: Date.now() + LIVE_WINDOW } : {}),
          } satisfies Cursor) };
        }
        next = readStorage();
        const entry = result.value;
        if (entry.error) { yield entry; continue; }
        if (entry.tombstone && account?.entries.has(entry.object.url)) this.remember(account, entry);
        if (account?.entries.get(entry.object.url)?.tombstone && !entry.tombstone) continue;
        if (alreadySeen(entry.object.url, entry.tombstone === true)) continue;
        yield entry;
      }
    } finally {
      for (const subscription of active) { subscription.readers--; subscription.used = Date.now(); }
      await iterator.return({ cursor: "" });
    }
  }

  private async closeAccount(account: Account) {
    account.entries.clear();
    this.wake(account);
    const connections = [...account.connections.values()];
    account.connections.clear();
    await Promise.all(connections.map(connection => connection.room?.close()));
  }

  /** Close peer connections. Accepted writes remain with the underlying implementation. */
  async close() {
    this.closed = true;
    clearInterval(this.timer);
    this.sessionEvents.removeEventListener("logout", this.logoutListener);
    const accounts = [...this.accounts.values()];
    this.accounts.clear();
    await Promise.all(accounts.map(account => this.closeAccount(account)));
  }
}
