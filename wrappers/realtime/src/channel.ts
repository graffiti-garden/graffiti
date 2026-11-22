import {
  GraffitiObjectJSONSchema,
  GraffitiErrorSchemaMismatch,
  compileGraffitiObjectSchema,
  isActorAllowedGraffitiObject,
  maskGraffitiObject,
  type Graffiti,
  type GraffitiObjectBase,
  type GraffitiMediaAccept,
  type GraffitiSession,
} from "@graffiti-garden/api";
import { GraffitiRelay, joinTransport } from "@graffiti-garden/realtime/signaling";
import { encode, decode } from "@ipld/dag-cbor";

export type Change = { object: GraffitiObjectBase; tombstone?: true };
type Peer = { actor?: string; ready: boolean; sending?: Promise<void> };
const protocol = "graffiti-wrapper-realtime/v1";

/**
 * One channel's direct Trystero connections. Graffiti authenticates each endpoint
 * once; the author then sends only the requesting actor's permitted object view.
 * Signaling goes through the underlying implementation, never through realtime.
 */
export class Channel {
  private relay: GraffitiRelay;
  private room;
  private changes;
  private media;
  private peers = new Map<string, Peer>();
  private closed = false;

  constructor(
    graffiti: Graffiti,
    readonly channel: string,
    readonly session: GraffitiSession,
    receive: (change: Change) => void,
    private report: (error: unknown) => void,
    current: () => Iterable<Change>,
  ) {
    this.relay = new GraffitiRelay(graffiti, session, report);
    this.room = joinTransport({ appId: protocol, identity: "none", password: channel, relay: this.relay }, channel);
    const identity = this.room.makeAction<null, string>("identity", { kind: "request" });
    const ready = this.room.makeAction<null>("ready");
    this.changes = this.room.makeAction<string>("objects");
    this.media = this.room.makeAction<string, Uint8Array | null>("media", { kind: "request" });
    const validate = compileGraffitiObjectSchema(GraffitiObjectJSONSchema);
    void validate.catch(report);
    let binding: Promise<GraffitiObjectBase> | undefined;
    identity.onRequest(async () => {
      binding ??= this.room.getSelf().then(({ peerId, userId }) =>
        this.relay.post({ protocol, peerId, userId }, []));
      try { return (await binding).url; }
      catch (error) { binding = undefined; throw error; }
    });
    this.room.onError(error => report(new Error(error.message, { cause: error })));

    // Each endpoint acknowledges actor verification before either sends data.
    // Otherwise the faster endpoint could lose its one-time catalog at the
    // slower endpoint's receive gate. No frame queue is needed during setup.
    const replay = async (peerId: string, peer: Peer) => {
      const until = Date.now() + 1000;
      for (const change of current()) {
        if (this.closed || this.peers.get(peerId) !== peer || Date.now() >= until) break;
        if (change.object.actor !== session.actor || !change.object.channels.includes(channel)) continue;
        if (peer.sending) break; // Current live delivery takes priority over replay.
        await this.deliver(change, peerId, peer);
      }
    };
    ready.onMessage((_value, { peerId }) => {
      const peer = this.peers.get(peerId);
      if (!peer || peer.ready || this.closed) return;
      peer.ready = true;
      if (peer.actor) void replay(peerId, peer).catch(report);
    });

    this.room.onPeerJoin(async ({ peerId, userId }) => {
      const peer: Peer = { ready: false };
      this.peers.set(peerId, peer);
      // A connected transport is not yet an authenticated actor. Retry transient
      // storage failures, but never accumulate live objects behind this lookup.
      while (!this.closed && this.peers.get(peerId) === peer && !peer.actor) {
        try {
          const url = await identity.request(null, { target: peerId, timeoutMs: 5000 });
          const object = await graffiti.get(url, {
            properties: { value: {
              properties: { protocol: { const: protocol }, peerId: { const: peerId }, userId: { const: userId } },
              required: ["protocol", "peerId", "userId"],
            } },
          }, session);
          if (this.closed || this.peers.get(peerId) !== peer) return;
          peer.actor = object.actor;
          void ready.send(null, { target: peerId }).catch(report);
          // Replay only the short live window, never persistent history.
          if (peer.ready) void replay(peerId, peer).catch(report);
        } catch (error) {
          if (this.closed || this.peers.get(peerId) !== peer) return;
          report(error);
          if (error instanceof GraffitiErrorSchemaMismatch) return;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    });
    this.room.onPeerLeave(({ peerId }) => this.peers.delete(peerId));
    this.changes.onReceive(({ peerId }) => !!this.peers.get(peerId)?.actor && !this.closed);
    this.changes.onMessage(async (text, { peerId }) => {
      try {
        const actor = this.peers.get(peerId)?.actor;
        if (!actor || this.closed) return;
        const change = JSON.parse(text) as Change;
        if (!(await validate)(change.object) || change.object.actor !== actor ||
            !change.object.channels.includes(channel) ||
            (change.tombstone !== undefined && change.tombstone !== true) ||
            !isActorAllowedGraffitiObject(change.object, session)) return;
        receive({ object: maskGraffitiObject(change.object, [channel], session.actor),
          ...(change.tombstone ? { tombstone: true } : {}) });
      } catch (error) { report(error); }
    });
    this.media.onRequest(async (request, { peerId }) => {
      const actor = this.peers.get(peerId)?.actor;
      if (!actor || this.closed) return null;
      const { url, accept, refresh } = JSON.parse(request) as { url: string; accept: GraffitiMediaAccept; refresh: boolean };
      try {
        const media = await graffiti.getMedia(url, accept, { session, refresh });
        if (media.actor !== session.actor || (Array.isArray(media.allowed) &&
            actor !== media.actor && !media.allowed.includes(actor))) return null;
        return encode({
          data: new Uint8Array(await media.data.arrayBuffer()), type: media.data.type,
          allowed: Array.isArray(media.allowed) ? (actor === media.actor ? media.allowed : [actor]) : null,
        });
      } catch { return null; } // A peer must not learn whether an inaccessible URL exists.
    });
  }

  private async sendTo(change: Change, peerId: string, actor: string) {
    if (this.closed || !isActorAllowedGraffitiObject(change.object, { actor })) return;
    return this.changes.send(JSON.stringify({
      object: maskGraffitiObject(change.object, [this.channel], actor),
      ...(change.tombstone ? { tombstone: true } : {}),
    }), { target: peerId });
  }

  private deliver(change: Change, peerId: string, peer: Peer) {
    const sending = this.sendTo(change, peerId, peer.actor!).catch(error => {
      if (!this.closed) this.report(error);
    }).finally(() => { if (peer.sending === sending) peer.sending = undefined; });
    return peer.sending = sending;
  }

  /** Delivery runs independently of the durable local write acknowledgment. */
  send(change: Change) {
    for (const [peerId, peer] of this.peers) {
      // No queue behind verification or a slow connection. New live changes
      // resume as soon as this peer drains; durable delivery belongs to storage.
      if (peer.actor && peer.ready && !peer.sending) void this.deliver(change, peerId, peer);
    }
  }

  async getMedia(url: string, accept: GraffitiMediaAccept, refresh: boolean) {
    for (const [peerId, peer] of this.peers) {
      const actor = peer.actor;
      if (!actor || this.closed) continue;
      try {
        const bytes = await this.media.request(JSON.stringify({ url, accept, refresh }), { target: peerId, timeoutMs: 2000 });
        if (!bytes) continue;
        const value = decode<{ data: Uint8Array; type: string; allowed: string[] | null }>(bytes);
        if (!(value.data instanceof Uint8Array) || typeof value.type !== "string" ||
            (value.allowed !== null && (!Array.isArray(value.allowed) ||
              !value.allowed.every(actor => typeof actor === "string") ||
              (actor !== this.session.actor && !value.allowed.includes(this.session.actor))))) continue;
        return { data: new Blob([value.data.slice()], { type: value.type }), actor,
          ...(value.allowed === null ? {} : { allowed: value.allowed }) };
      } catch (error) { this.report(error); }
    }
  }

  async close() {
    this.closed = true;
    this.peers.clear();
    try { await this.room.leave(); }
    finally { await this.relay.close(); }
  }
}
