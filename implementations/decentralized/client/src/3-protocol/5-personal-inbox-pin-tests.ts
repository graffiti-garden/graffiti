import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GraffitiErrorCursorExpired, GraffitiErrorNotFound, type GraffitiObjectStream } from "@graffiti-garden/api";
import { encode as dagCborEncode, decode as dagCborDecode } from "@ipld/dag-cbor";
import { GraffitiDecentralized } from "./5-graffiti";
import { PINNED_BY_ME_KEY, type LabeledMessage } from "../1-services/4-inboxes";
import { mockCacheStorage } from "./4-discovery/cache-tests";

const actor = "did:web:recipient.test";
const author = "did:web:author.test";
const personal = "https://example.test/personal";
const shared = "https://example.test/shared";
const bucket = "https://example.test/bucket";
const channel = "personal-inbox-pins";

class PersonalPinGraffiti extends GraffitiDecentralized {
  constructor() { super({ defaultInboxEndpoints: [shared] }); }
  get services() {
    return { inboxes: this.inboxes, sessions: this.sessions, dids: this.dids,
      buckets: this.storageBuckets, verification: this.verification };
  }
  override querySingleEndpoint = super.querySingleEndpoint;
  async announcement(id: string, pinned = false) {
    const encoded = await this.objectEncoding.encode<{}>({ value: { id }, channels: [channel] }, author);
    const message: LabeledMessage<{}> = { id, l: 0, [PINNED_BY_ME_KEY]: pinned,
      m: { o: encoded.object, t: encoded.tags, m: dagCborEncode({ k: id }) } };
    return { message, bytes: encoded.objectBytes };
  }
}

function setup(graffiti: PersonalPinGraffiti, announcements: Awaited<ReturnType<PersonalPinGraffiti["announcement"]>>[]) {
  const service = { token: "token", authorizationEndpoint: "https://example.test/auth" };
  vi.spyOn(graffiti.services.sessions, "resolveSession").mockReturnValue({
    actor, tokens: [], servicesByAuthorization: [],
    personalInbox: { ...service, serviceEndpoint: personal },
    sharedInboxes: [{ ...service, serviceEndpoint: shared }],
    storageBucket: { ...service, serviceEndpoint: bucket },
  });
  vi.spyOn(graffiti.services.dids, "resolve").mockResolvedValue({ id: author,
    service: [{ id: "#graffitiStorageBucket", type: "GraffitiStorageBucket", serviceEndpoint: bucket }] });
  const read = vi.spyOn(graffiti.services.buckets, "get").mockImplementation(async (_endpoint, key) => {
    const stored = announcements.find(item => item.message.id === key);
    if (!stored) throw new GraffitiErrorNotFound("Missing object");
    return stored.bytes;
  });
  vi.spyOn(graffiti.services.inboxes, "label").mockResolvedValue();
  const pin = vi.spyOn(graffiti.services.inboxes, "pin").mockResolvedValue();
  const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
    const body = dagCborDecode(new Uint8Array(await new Response(init?.body).arrayBuffer()));
    return new Response(dagCborEncode({ cursor: "after-page", hasMore: false,
      results: body && typeof body === "object" && "cursor" in body ? [] : announcements.map(item => item.message),
    }).slice());
  });
  vi.stubGlobal("fetch", fetch);
  return { read, pin, fetch };
}

async function collect(stream: GraffitiObjectStream<{}>) {
  const entries = [];
  while (true) {
    const next = await stream.next();
    if (next.done) return { entries, cursor: next.value.cursor };
    entries.push(next.value);
  }
}
function checkpoint(cursor: string) { return JSON.parse(JSON.parse(cursor).cursors[personal]); }

export function personalInboxPinTests() {
  describe("Personal inbox pins", () => {
    let now: number;
    let cache: ReturnType<typeof mockCacheStorage>;
    beforeEach(() => {
      cache = mockCacheStorage();
      now = Date.now();
      vi.spyOn(Date, "now").mockImplementation(() => now);
    });
    afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

    test("pins only validated personal messages and treats p only as a pin hint", async () => {
      const graffiti = new PersonalPinGraffiti();
      const fresh = await graffiti.announcement("fresh");
      const pinned = await graffiti.announcement("pinned", true);
      const forged = await graffiti.announcement("forged", true);
      forged.message.m.o.value = { forged: true };
      const missing = await graffiti.announcement("missing");
      const { read, pin } = setup(graffiti, [fresh, pinned, forged, missing]);
      read.mockImplementation(async (_endpoint, key) => {
        if (key === "missing") throw new GraffitiErrorNotFound("Deleted");
        return key === "fresh" ? fresh.bytes : key === "pinned" ? pinned.bytes : forged.bytes;
      });
      const result = await collect(graffiti.discover<{}>([channel], {}, { actor }));
      expect(result.entries.filter(item => !item.error)).toEqual([
        { object: fresh.message.m.o }, { object: pinned.message.m.o },
      ]);
      // Even p:true cannot make forged content valid. Shared copies are never sponsored.
      expect(result.entries.filter(item => item.error)).toHaveLength(2);
      expect(pin.mock.calls).toEqual([[personal, ["fresh"], "token"]]);
    });

    test("anonymous readers never pin shared messages", async () => {
      const graffiti = new PersonalPinGraffiti();
      const item = await graffiti.announcement("anonymous");
      const { pin } = setup(graffiti, [item]);
      expect((await collect(graffiti.discover<{}>([channel], {}))).entries).toEqual([{ object: item.message.m.o }]);
      expect(pin).not.toHaveBeenCalled();
    });

    test("does not pin tombstone announcements", async () => {
      const graffiti = new PersonalPinGraffiti();
      const original = await graffiti.announcement("original");
      const { read, pin, fetch } = setup(graffiti, [original]);
      const initial = await collect(graffiti.discover<{}>([channel], {}, { actor }));
      expect(pin).toHaveBeenCalledOnce();
      pin.mockClear();
      const tombstone = structuredClone(original.message);
      tombstone.id = "deleted";
      tombstone.m.m = dagCborEncode({ k: original.message.id, t: original.message.id });
      read.mockRejectedValue(new GraffitiErrorNotFound("Deleted"));
      fetch.mockImplementation(async () => new Response(dagCborEncode({
        results: [tombstone], cursor: "after-deletion", hasMore: false,
      }).slice()));
      const deleted = await collect(graffiti.continueDiscover<{}>(initial.cursor, { actor }));
      expect(deleted.entries).toEqual([{ tombstone: true, object: original.message.m.o }]);
      // Deletion announcements remain unpinned for the retention policy to expire.
      expect(pin).not.toHaveBeenCalled();
    });

    test("delivers objects despite failed pins, advances the cursor, and retries without redelivery", async () => {
      const graffiti = new PersonalPinGraffiti();
      const item = await graffiti.announcement("retry");
      const { pin } = setup(graffiti, [item]);
      const failure = new TypeError("Pin response lost");
      pin.mockRejectedValueOnce(failure);
      const initial = await collect(graffiti.discover<{}>([channel], {}, { actor }));
      expect(initial.entries).toEqual([
        { object: item.message.m.o }, { error: expect.objectContaining({ cause: failure }), origin: personal },
      ]);
      expect(JSON.parse(checkpoint(initial.cursor).cursor).numSeen).toBe(1);
      expect(checkpoint(initial.cursor).pending).toEqual([{
        id: "retry", url: item.message.m.o.url, pin: true, delay: 1000, retryAt: now + 1000,
      }]);

      // Reload with only persisted protocol state and the caller's cursor.
      const reloaded = new PersonalPinGraffiti();
      const next = setup(reloaded, [item]);
      next.pin.mockRejectedValueOnce(failure);
      const skipped = await collect(reloaded.continueDiscover<{}>(initial.cursor, { actor }));
      expect(skipped.entries).toEqual([{ error: expect.any(Error), origin: personal }]);
      expect(next.pin).not.toHaveBeenCalled();
      now += 1000;
      const failed = await collect(reloaded.continueDiscover<{}>(skipped.cursor, { actor }));
      expect(failed.entries).toEqual([{ error: expect.objectContaining({ cause: failure }), origin: personal }]);
      expect(checkpoint(failed.cursor).pending[0].delay).toBe(2000);
      now += 2000;
      const recovered = await collect(reloaded.continueDiscover<{}>(failed.cursor, { actor }));
      expect(recovered.entries).toEqual([]);
      expect(checkpoint(recovered.cursor).pending).toEqual([]);
      expect(next.pin).toHaveBeenCalledTimes(2);
      expect(next.read).not.toHaveBeenCalled();
    });

    test("a failed read is not pinned until a later poll validates it", async () => {
      const graffiti = new PersonalPinGraffiti();
      const item = await graffiti.announcement("read-retry", true);
      const { read, pin } = setup(graffiti, [item]);
      read.mockRejectedValue(new TypeError("Read offline"));
      const initial = await collect(graffiti.discover<{}>([channel], {}, { actor }));
      expect(pin).not.toHaveBeenCalled();
      read.mockResolvedValue(item.bytes);
      now += 1000;
      expect((await collect(graffiti.continueDiscover<{}>(initial.cursor, { actor }))).entries)
        .toEqual([{ object: item.message.m.o }]);
      // The old p:true was deliberately not cached. Repeating a pin is safe.
      expect(pin.mock.calls).toEqual([[personal, [item.message.id], "token"]]);
    });

    test("pins new arrivals while an earlier failure is waiting for retry", async () => {
      const graffiti = new PersonalPinGraffiti();
      const first = await graffiti.announcement("first");
      const messages = [first];
      const { pin, fetch } = setup(graffiti, messages);
      pin.mockRejectedValueOnce(new TypeError("Offline"));
      const initial = await collect(graffiti.discover<{}>([channel], {}, { actor }));
      const next = await graffiti.announcement("next");
      messages.push(next);
      fetch.mockImplementation(async input => new Response(dagCborEncode({
        results: String(input) === `${personal}/query` ? [next.message] : [],
        cursor: "after-next", hasMore: false,
      }).slice()));
      const continued = await collect(graffiti.continueDiscover<{}>(initial.cursor, { actor }));
      expect(continued.entries).toEqual([
        { object: next.message.m.o }, { error: expect.any(Error), origin: personal },
      ]);
      expect(pin.mock.calls).toEqual([[personal, ["first"], "token"], [personal, ["next"], "token"]]);
      expect(checkpoint(continued.cursor).pending).toEqual(checkpoint(initial.cursor).pending);
    });

    test("batches new pins and bounds retry work without holding up new arrivals", async () => {
      const graffiti = new PersonalPinGraffiti();
      const items = await Promise.all(Array.from({ length: 101 }, (_, i) => graffiti.announcement(String(i))));
      const { pin } = setup(graffiti, items);
      pin.mockRejectedValueOnce(new TypeError("Offline"));
      let result = await collect(graffiti.discover<{}>([channel], {}, { actor }));
      expect(result.entries.filter(item => !item.error)).toHaveLength(101);
      expect(pin.mock.calls.map(([, ids]) => ids.length)).toEqual([100, 1]);
      expect(checkpoint(result.cursor).pending).toHaveLength(100);
      now += 1000;
      for (const remaining of [68, 36, 4, 0]) {
        result = await collect(graffiti.continueDiscover<{}>(result.cursor, { actor }));
        expect(result.entries.every(item => item.error)).toBe(true);
        expect(checkpoint(result.cursor).pending).toHaveLength(remaining);
      }
      expect(pin.mock.calls.map(([, ids]) => ids.length)).toEqual([100, 1, 32, 32, 32, 4]);
    });

    test.each(["deleted", "evicted", "reader changed"])("does not retry a pin after its evidence is %s", async change => {
      const graffiti = new PersonalPinGraffiti();
      const item = await graffiti.announcement("pending");
      const { pin } = setup(graffiti, [item]);
      pin.mockRejectedValueOnce(new TypeError("Offline"));
      const initial = await collect(graffiti.discover<{}>([channel], {}, { actor }));
      now += 1000;
      if (change === "deleted") {
        await graffiti.services.verification.deleted(item.message.m.o.url, item.message.id);
        expect((await collect(graffiti.continueDiscover<{}>(initial.cursor, { actor }))).entries).toEqual([]);
      } else {
        if (change === "evicted") cache("graffiti-inbox-messages-v1").entries.clear();
        await expect(collect(graffiti.continueDiscover<{}>(initial.cursor,
          change === "reader changed" ? { actor: "did:web:other.test" } : { actor })))
          .rejects.toBeInstanceOf(GraffitiErrorCursorExpired);
      }
      expect(pin).toHaveBeenCalledOnce();
    });

    test("early closure still pins delivered messages and handles a failed pin", async () => {
      const graffiti = new PersonalPinGraffiti();
      const item = await graffiti.announcement("closed");
      const { pin } = setup(graffiti, [item]);
      pin.mockRejectedValueOnce(new TypeError("Offline"));
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const stream = graffiti.querySingleEndpoint<{}>(personal,
        { tags: item.message.m.t, objectSchema: {} }, "token", actor, { pin: true });
      expect((await stream.next()).value).toMatchObject({ object: item.message.m.o });
      await stream.return("");
      expect(pin).toHaveBeenCalledOnce();
      expect(error).toHaveBeenCalledOnce();
      // No cursor was returned. A fresh discovery can still retry using the cached body.
      await collect(graffiti.discover<{}>([channel], {}, { actor }));
      expect(pin).toHaveBeenCalledTimes(2);
    });
  });
}
