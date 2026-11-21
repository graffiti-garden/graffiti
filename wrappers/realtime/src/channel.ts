import {
  GraffitiObjectJSONSchema,
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
  private peers = new Map<string, Promise<string | undefined>>();
  private closed = false;

  constructor(
    graffiti: Graffiti,
    readonly channel: string,
    readonly session: GraffitiSession,
    receive: (change: Change) => void,
    private report: (error: unknown) => void,
  ) {
    this.relay = new GraffitiRelay(graffiti, session, report);
    this.room = joinTransport({ appId: protocol, identity: "none", password: channel, relay: this.relay }, channel);
    const identity = this.room.makeAction<null, string>("identity", { kind: "request" });
    this.changes = this.room.makeAction<string>("objects");
    this.media = this.room.makeAction<string, Uint8Array | null>("media", { kind: "request" });
    const validate = compileGraffitiObjectSchema(GraffitiObjectJSONSchema);
    void validate.catch(report);
    const binding = this.room.getSelf().then(({ peerId, userId }) =>
      this.relay.post({ protocol, peerId, userId }, []));
    identity.onRequest(async () => (await binding).url);
    void binding.catch(report);
    this.room.onError(error => report(new Error(error.message, { cause: error })));

    this.room.onPeerJoin(({ peerId, userId }) => {
      const verified = identity.request(null, { target: peerId }).then(async url => {
        const object = await graffiti.get(url, {
          properties: { value: {
            properties: { protocol: { const: protocol }, peerId: { const: peerId }, userId: { const: userId } },
            required: ["protocol", "peerId", "userId"],
          } },
        }, session);
        if (this.closed || this.peers.get(peerId) !== verified) return;
        return object.actor;
      }).catch(error => { report(error); return undefined; });
      this.peers.set(peerId, verified);
      // A newly connected reader also needs writes accepted before it arrived.
      void verified.then(async actor => {
        if (!actor) return;
        for await (const result of graffiti.discover([channel], {}, { session, refresh: false })) {
          if (this.closed) break;
          if (result.error) { report(result.error); continue; }
          if (result.object.actor === session.actor) await this.sendTo(result, peerId, actor);
        }
      }).catch(report);
    });
    this.room.onPeerLeave(({ peerId }) => this.peers.delete(peerId));
    this.changes.onMessage(async (text, { peerId }) => {
      try {
        const actor = await this.peers.get(peerId);
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
      const actor = await this.peers.get(peerId);
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

  private sendTo(change: Change, peerId: string, actor: string) {
    if (this.closed || !isActorAllowedGraffitiObject(change.object, { actor })) return;
    return this.changes.send(JSON.stringify({ ...change,
      object: maskGraffitiObject(change.object, [this.channel], actor),
    }), { target: peerId });
  }

  /** Delivery runs independently of the durable local write acknowledgment. */
  send(change: Change) {
    for (const [peerId, peer] of this.peers) {
      void peer.then(actor => { if (actor) return this.sendTo(change, peerId, actor); }).catch(this.report);
    }
  }

  async getMedia(url: string, accept: GraffitiMediaAccept, refresh: boolean) {
    for (const [peerId, peer] of this.peers) {
      const actor = await peer;
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
