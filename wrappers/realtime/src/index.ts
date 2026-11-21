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

type Entry = Change & { sequence: number };
type Account = {
  connections: Map<string, Channel>;
  entries: Map<string, Entry>;
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
};

/**
 * Add live peer delivery to a Graffiti implementation. The underlying
 * implementation owns persistence and flush; applications use the usual API.
 * Each signed-in account has one room per channel, kept until logout or close().
 * Anonymous readers and runtimes without WebRTC use the underlying implementation.
 */
// @ts-ignore JSON schema inference exceeds TypeScript's structural comparison depth.
export class GraffitiRealtime extends GraffitiRuntimeTypes {
  private accounts = new Map<string, Account>();
  private sequence = 0;
  private instance = crypto.randomUUID();
  private closed = false;
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
    const account: Account = this.accounts.get(session.actor) ?? {
      connections: new Map(), entries: new Map(),
    };
    this.accounts.set(session.actor, account);
    for (const channel of channels) {
      if (account.connections.has(channel)) continue;
      const connection = new Channel(this.graffiti, channel, session,
        change => this.remember(account, change),
        error => { account.error = error instanceof Error ? error : new Error(String(error)); },
      );
      account.connections.set(channel, connection);
    }
    return account;
  }

  /** Merge permitted channel views once, and keep deletions final. */
  private remember(account: Account, change: Change) {
    const previous = account.entries.get(change.object.url);
    const channels = [...new Set([
      ...(previous?.object.channels ?? []),
      ...change.object.channels,
    ])];
    const tombstone = previous?.tombstone || change.tombstone;
    if (previous && previous.tombstone === tombstone && channels.length === previous.object.channels.length) return;
    account.entries.set(change.object.url, {
      object: { ...(previous?.object ?? change.object), channels },
      ...(tombstone ? { tombstone } : {}),
      sequence: ++this.sequence,
    });
  }

  private send(change: Change, session: GraffitiSession) {
    try {
      const account = this.subscribe(change.object.channels, session);
      if (!account) return;
      this.remember(account, change);
      for (const channel of change.object.channels) account.connections.get(channel)!.send(change);
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
    const entry = session && this.accounts.get(session.actor)?.entries.get(unpackObjectUrl(url));
    if (entry?.tombstone) throw new GraffitiErrorNotFound("Object has been deleted");
    if (entry && !refresh) {
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
      const media = await connection.getMedia(url, accept, refresh);
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
          !Number.isSafeInteger(parsed.sequence)) {
        throw new Error();
      }
    } catch { throw new GraffitiErrorCursorExpired("Invalid realtime cursor"); }
    const normalized = normalizeGraffitiReadOptions(options);
    if (parsed.actor !== (normalized.session?.actor ?? null)) {
      throw new GraffitiErrorForbidden("Cursor belongs to another session");
    }
    return yield* this.discoverCombined(parsed.channels, parsed.schema as Schema, normalized, parsed);
  }

  private async *discoverCombined<Schema extends JSONSchema>(
    channels: string[], schema: Schema, options: GraffitiReadOptions, cursor?: Cursor,
  ): GraffitiObjectStream<Schema> {
    const validate = await compileGraffitiObjectSchema(schema);
    const account = this.subscribe(channels, options.session);
    const iterator = cursor
      ? this.graffiti.continueDiscover<Schema>(cursor.storage, options)
      : this.graffiti.discover(channels, schema, options);
    let sequence = cursor?.instance === this.instance ? cursor.sequence : 0;
    const seen = new Map<string, boolean>();
    let next = iterator.next();
    // A storage request can fail while the consumer is paused at a yield.
    // Handle that rejection now; awaiting the original promise still throws it.
    void next.catch(() => {});
    try {
      while (true) {
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
          if (!validate(object) || seen.get(object.url) === (entry.tombstone === true)) continue;
          seen.set(object.url, entry.tombstone === true);
          yield entry.tombstone ? { object: structuredClone(object), tombstone: true } : { object: structuredClone(object) };
        }
        sequence = through;
        // Keep receiving live changes while a finite storage page is in flight.
        let timer: ReturnType<typeof setTimeout> | undefined;
        const result = account ? await Promise.race([
          next,
          new Promise<undefined>(resolve => {
            timer = setTimeout(() => resolve(undefined), 50);
          }),
        ]) : await next;
        clearTimeout(timer);
        if (!result) continue;
        if (result.done) {
          // Immediate storage caches should not cause a tight continuation loop.
          if (account) await new Promise(resolve => setTimeout(resolve, 50));
          return { cursor: JSON.stringify({
            realtime: 1,
            instance: this.instance,
            channels,
            schema,
            actor: options.session?.actor ?? null,
            sequence,
            storage: result.value.cursor,
          } satisfies Cursor) };
        }
        next = iterator.next();
        void next.catch(() => {});
        const entry = result.value;
        if (entry.error) { yield entry; continue; }
        if (entry.tombstone && account) this.remember(account, entry);
        if (account?.entries.get(entry.object.url)?.tombstone && !entry.tombstone) continue;
        if (seen.get(entry.object.url) === (entry.tombstone === true)) continue;
        seen.set(entry.object.url, entry.tombstone === true);
        yield entry;
      }
    } finally { await iterator.return({ cursor: "" }); }
  }

  private async closeAccount(account: Account) {
    account.entries.clear();
    const connections = [...account.connections.values()];
    account.connections.clear();
    await Promise.all(connections.map(connection => connection.close()));
  }

  /** Close peer connections. Accepted writes remain with the underlying implementation. */
  async close() {
    this.closed = true;
    this.sessionEvents.removeEventListener("logout", this.logoutListener);
    const accounts = [...this.accounts.values()];
    this.accounts.clear();
    await Promise.all(accounts.map(account => this.closeAccount(account)));
  }
}
