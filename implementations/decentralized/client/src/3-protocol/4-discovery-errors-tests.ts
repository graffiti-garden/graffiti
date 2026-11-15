import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as fakeIndexedDB from "fake-indexeddb";
import {
  GraffitiErrorCursorExpired,
  GraffitiErrorNotFound,
  type GraffitiObjectStream,
} from "@graffiti-garden/api";
import { encode as dagCborEncode, decode as dagCborDecode } from "@ipld/dag-cbor";
import { GraffitiDecentralized } from "./4-graffiti";
import { RECORD_KIND_KEY, RECORD_KIND_MEDIA, type RecordKind } from "./3-object-encoding";
import type { LabeledMessage } from "../1-services/4-inboxes";
import { GraffitiErrorUnauthorized } from "../1-services/utilities";

const inboxEndpoint = "https://example.test/inbox";
const channel = "discovery-errors";
const bucketEndpoint = "https://example.test/bucket";
const actor = "did:web:example.test";
class CursorGraffiti extends GraffitiDecentralized {
  get inboxService() { return this.inboxes; }
}

class ValidationGraffiti extends CursorGraffiti {
  constructor() { super({ defaultInboxEndpoints: [inboxEndpoint] }); }
  get services() {
    return { buckets: this.storageBuckets, dids: this.dids, sessions: this.sessions };
  }
  async announcement(id: string, kind?: RecordKind) {
    const encoded = await this.objectEncoding.encode<{}>({ value: { text: id }, channels: [channel] }, actor, kind);
    const message: LabeledMessage<{}> = {
      id, l: 0,
      m: { o: encoded.object, t: encoded.tags, m: dagCborEncode({
        k: id, ...(kind === undefined ? {} : { [RECORD_KIND_KEY]: kind }),
      }) },
    };
    return { message, bytes: encoded.objectBytes };
  }
}

function inboxPage(messages: LabeledMessage<{}>[]) {
  return new Response(new Uint8Array(dagCborEncode({
    results: messages, cursor: "after-messages", hasMore: false,
  })));
}

function checkpoint(cursor: string) {
  return JSON.parse(JSON.parse(cursor).cursors[inboxEndpoint]);
}

function serveMessages(graffiti: ValidationGraffiti, messages: LabeledMessage<{}>[]) {
  vi.spyOn(graffiti.services.dids, "resolve").mockResolvedValue({
    id: actor,
    service: [{ id: "#graffitiStorageBucket", type: "GraffitiStorageBucket", serviceEndpoint: bucketEndpoint }],
  });
  // Use the real inbox cache so retries exercise the saved message positions.
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url !== `${inboxEndpoint}/query`) throw new Error(`Unexpected fetch: ${url}`);
    const body = dagCborDecode(new Uint8Array(await new Response(init?.body).arrayBuffer()));
    return inboxPage(body && typeof body === "object" && "cursor" in body ? [] : messages);
  }));
}

function mockSession(graffiti: ValidationGraffiti) {
  const service = { token: "session-token", authorizationEndpoint: "https://example.test/auth" };
  vi.spyOn(graffiti.services.sessions, "resolveSession").mockReturnValue({
    actor, tokens: [], servicesByAuthorization: [],
    personalInbox: { ...service, serviceEndpoint: inboxEndpoint },
    storageBucket: { ...service, serviceEndpoint: bucketEndpoint },
    sharedInboxes: [],
  });
  return vi.spyOn(graffiti.services.sessions, "forget").mockImplementation(() => {});
}

async function collectDiscovery(stream: GraffitiObjectStream<{}>) {
  const entries = [];
  while (true) {
    const next = await stream.next();
    if (next.done) return { entries, cursor: next.value.cursor };
    entries.push(next.value);
  }
}

async function finishDiscovery(stream: GraffitiObjectStream<{}>) {
  while (true) {
    const next = await stream.next();
    if (next.done) return next.value.cursor;
  }
}

export function discoveryErrorTests() {
  describe("Discovery object errors", () => {
    let now: number;
    beforeEach(() => {
      now = Date.now();
      // Keep real async work running; only control retry eligibility.
      vi.spyOn(Date, "now").mockImplementation(() => now);
    });
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    test.each(["initial", "continued"])("retries a temporary object failure after %s discovery", async (start) => {
      const graffiti = new ValidationGraffiti();
      const first = await graffiti.announcement("first");
      const second = await graffiti.announcement("second");
      const third = await graffiti.announcement("third");
      serveMessages(graffiti, [first.message, second.message]);
      let cursor: string | undefined;
      if (start === "continued") {
        // First obtain a checkpoint before either object has arrived.
        vi.mocked(fetch).mockResolvedValueOnce(inboxPage([]));
        cursor = await finishDiscovery(graffiti.discover<{}>([channel], {}));
        vi.mocked(fetch).mockResolvedValueOnce(inboxPage([first.message, second.message]));
      }
      const failure = new TypeError("Connection lost");
      const read = vi.spyOn(graffiti.services.buckets, "get")
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce(second.bytes)
        .mockResolvedValue(first.bytes);
      const result = await collectDiscovery(cursor
        ? graffiti.continueDiscover<{}>(cursor)
        : graffiti.discover<{}>([channel], {}));

      // Report the failed object in place, then continue the same inbox.
      expect(result.entries).toEqual([
        { error: expect.objectContaining({ cause: failure }), origin: inboxEndpoint },
        { object: second.message.m.o },
      ]);
      expect(read).toHaveBeenCalledTimes(2); // No retry during this discovery.
      expect(JSON.parse(checkpoint(result.cursor).cursor).numSeen).toBe(2);
      expect(checkpoint(result.cursor).pending).toEqual([
        { id: first.message.id, delay: 1000, retryAt: now + 1000 },
      ]);
      expect((await graffiti.inboxService.get(inboxEndpoint, first.message.id))?.l).toBe(0);
      await vi.waitFor(async () => {
        expect((await graffiti.inboxService.get(inboxEndpoint, second.message.id))?.l).toBe(1);
      });

      // A poll before the retry is due still returns new objects and completes
      // without waiting or replaying the already delivered second object.
      vi.mocked(fetch).mockResolvedValueOnce(inboxPage([third.message]));
      read.mockResolvedValueOnce(third.bytes);
      const deferred = await collectDiscovery(graffiti.continueDiscover<{}>(result.cursor));
      expect(deferred.entries).toEqual([
        { object: third.message.m.o },
        { error: expect.any(Error), origin: inboxEndpoint },
      ]);
      expect(checkpoint(deferred.cursor).pending).toEqual(checkpoint(result.cursor).pending);
      expect(read).toHaveBeenCalledTimes(3);

      // Only the failed message is replayed when a later poll finds it due.
      now += 1000;
      const recovered = await collectDiscovery(graffiti.continueDiscover<{}>(deferred.cursor));
      expect(recovered.entries).toEqual([{ object: first.message.m.o }]);
      expect(checkpoint(recovered.cursor).pending).toEqual([]);
      expect(read).toHaveBeenCalledTimes(4);
    });

    test("backs off actual failures, caps the delay, and still recovers", async () => {
      const graffiti = new ValidationGraffiti();
      const { message, bytes } = await graffiti.announcement("offline");
      serveMessages(graffiti, [message]);
      const read = vi.spyOn(graffiti.services.buckets, "get").mockRejectedValue(new TypeError("Offline"));
      let cursor = await finishDiscovery(graffiti.discover<{}>([channel], {}));

      for (const delay of [1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000]) {
        const pending = checkpoint(cursor).pending;
        expect(pending).toEqual([{ id: message.id, delay, retryAt: now + delay }]);
        const attempts = read.mock.calls.length;
        // Skipped polls neither wait for the deadline nor increase the backoff.
        now += delay - 1;
        cursor = await finishDiscovery(graffiti.continueDiscover<{}>(cursor));
        expect(checkpoint(cursor).pending).toEqual(pending);
        expect(read).toHaveBeenCalledTimes(attempts);
        now++;
        cursor = await finishDiscovery(graffiti.continueDiscover<{}>(cursor));
        expect(read).toHaveBeenCalledTimes(attempts + 1);
      }

      // Repeated failures never become a permanent invalid/deleted label.
      read.mockResolvedValue(bytes);
      now += 60000;
      const recovered = await collectDiscovery(graffiti.continueDiscover<{}>(cursor));
      expect(recovered.entries).toEqual([{ object: message.m.o }]);
      expect(checkpoint(recovered.cursor).pending).toEqual([]);
    });

    test("bounds retries per poll without starving the remaining messages", async () => {
      const graffiti = new ValidationGraffiti();
      const announcements = await Promise.all(Array.from({ length: 34 }, (_, i) => graffiti.announcement(String(i))));
      serveMessages(graffiti, announcements.map(({ message }) => message));
      const read = vi.spyOn(graffiti.services.buckets, "get").mockRejectedValue(new TypeError("Offline"));
      let cursor = await finishDiscovery(graffiti.discover<{}>([channel], {}));
      expect(read).toHaveBeenCalledTimes(34);

      now += 1000;
      cursor = await finishDiscovery(graffiti.continueDiscover<{}>(cursor));
      expect(read).toHaveBeenCalledTimes(34 + 32);
      // The failed retries are cooling down, so the next poll can attempt the
      // two previously deferred reads. No messages are lost to the retry budget.
      cursor = await finishDiscovery(graffiti.continueDiscover<{}>(cursor));
      expect(read.mock.calls.slice(-2).map(([, key]) => key)).toEqual(["32", "33"]);
      expect(read).toHaveBeenCalledTimes(34 + 34);
      expect(checkpoint(cursor).pending).toHaveLength(34);
    });

    test("preserves pending reads across instances and independent continuations", async () => {
      for (const [name, value] of Object.entries(fakeIndexedDB)) {
        if (name.startsWith("IDB")) vi.stubGlobal(name, value);
      }
      vi.stubGlobal("indexedDB", new fakeIndexedDB.IDBFactory());
      const first = new ValidationGraffiti();
      const { message, bytes } = await first.announcement("shared");
      serveMessages(first, [message]);
      const firstRead = vi.spyOn(first.services.buckets, "get").mockRejectedValue(new TypeError("Offline"));
      const cursor = await finishDiscovery(first.discover<{}>([channel], {}));

      // Only the cursor and ordinary IndexedDB cache survive a reload.
      const reloaded = new ValidationGraffiti();
      serveMessages(reloaded, [message]);
      const secondRead = vi.spyOn(reloaded.services.buckets, "get").mockResolvedValue(bytes);
      const deferred = await finishDiscovery(reloaded.continueDiscover<{}>(cursor));
      expect(secondRead).not.toHaveBeenCalled();
      now += 1000;
      expect((await collectDiscovery(reloaded.continueDiscover<{}>(deferred))).entries)
        .toEqual([{ object: message.m.o }]);

      // The first consumer still receives the recovered object through its
      // own cursor, reusing verification performed by the other consumer.
      expect((await collectDiscovery(first.continueDiscover<{}>(cursor))).entries)
        .toEqual([{ object: message.m.o }]);
      expect(firstRead).toHaveBeenCalledTimes(1);
      expect(secondRead).toHaveBeenCalledTimes(1);

      // Losing the cache expires the cursor instead of forgetting its reads.
      vi.stubGlobal("indexedDB", new fakeIndexedDB.IDBFactory());
      await expect(finishDiscovery(new ValidationGraffiti().continueDiscover<{}>(cursor)))
        .rejects.toBeInstanceOf(GraffitiErrorCursorExpired);
    });

    test("keeps media hidden after retrying its failed read", async () => {
      const graffiti = new ValidationGraffiti();
      const media = await graffiti.announcement("media", RECORD_KIND_MEDIA);
      const good = await graffiti.announcement("object");
      serveMessages(graffiti, [media.message, good.message]);
      const read = vi.spyOn(graffiti.services.buckets, "get")
        .mockRejectedValueOnce(new TypeError("Connection lost"))
        .mockResolvedValueOnce(good.bytes)
        .mockResolvedValue(media.bytes);

      // A failed media read is still retryable; it must not stop ordinary objects.
      const initial = await collectDiscovery(graffiti.discover<{}>([channel], {}));
      expect(initial.entries).toEqual([
        { error: expect.any(Error), origin: inboxEndpoint },
        { object: good.message.m.o },
      ]);
      // Once validated, the media record stays outside ordinary discovery.
      now += 1000;
      const recovered = await collectDiscovery(graffiti.continueDiscover<{}>(initial.cursor));
      expect(recovered.entries).toEqual([]);
      expect(read).toHaveBeenCalledTimes(3);
    });

    test.each(["DID lookup", "missing service"])("does not cache a failed %s as a deletion", async (failure) => {
      const graffiti = new ValidationGraffiti();
      const { message, bytes } = await graffiti.announcement("object");
      serveMessages(graffiti, [message]);
      const resolve = vi.mocked(graffiti.services.dids.resolve);
      if (failure === "DID lookup") resolve.mockRejectedValueOnce(new GraffitiErrorNotFound("Resolver offline"));
      else resolve.mockResolvedValueOnce({ id: actor });
      const label = vi.spyOn(graffiti.inboxService, "label");
      vi.spyOn(graffiti.services.buckets, "get").mockResolvedValue(bytes);

      const initial = await collectDiscovery(graffiti.discover<{}>([channel], {}));
      expect(initial.entries).toEqual([{ error: expect.any(Error), origin: inboxEndpoint }]);
      expect(label).not.toHaveBeenCalled();
      now += 1000;
      expect((await collectDiscovery(graffiti.continueDiscover<{}>(initial.cursor))).entries)
        .toEqual([{ object: message.m.o }]);
    });

    test("reports each object affected by a failed batch body and retries next poll", async () => {
      const graffiti = new ValidationGraffiti();
      const first = await graffiti.announcement("first");
      const second = await graffiti.announcement("second");
      serveMessages(graffiti, [first.message, second.message]);
      const queryFetch = globalThis.fetch;
      const failure = new TypeError("Connection lost during batch body");
      let reads = 0;
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (!String(input).startsWith(bucketEndpoint)) return queryFetch(input, init);
        expect(String(input)).toBe(`${bucketEndpoint}/values`);
        if (++reads === 1) return new Response(new ReadableStream({
          start(controller) { controller.error(failure); },
        }));
        return new Response(new Uint8Array(dagCborEncode({ results: [first, second].map(({ bytes }) => ({
          status: 200, value: bytes,
        })) })));
      }));

      const initial = await collectDiscovery(graffiti.discover<{}>([channel], {}));
      expect(initial.entries).toEqual([first, second].map(() => ({
        error: expect.objectContaining({ cause: failure }), origin: inboxEndpoint,
      })));
      expect(reads).toBe(1);
      now += 1000;
      expect((await collectDiscovery(graffiti.continueDiscover<{}>(initial.cursor))).entries)
        .toEqual([{ object: first.message.m.o }, { object: second.message.m.o }]);
      expect(reads).toBe(2);
    });

    test.each(["contents", "metadata", "false deletion"])("reports invalid %s without stopping discovery or holding its checkpoint", async (invalid) => {
      const graffiti = new ValidationGraffiti();
      const bad = await graffiti.announcement("bad");
      const good = await graffiti.announcement("good");
      if (invalid === "contents") bad.message.m.o.value = { forged: true };
      else bad.message.m.m = dagCborEncode(invalid === "metadata" ? {} : { k: "bad", t: "original" });
      serveMessages(graffiti, [bad.message, good.message]);
      vi.spyOn(graffiti.services.buckets, "get").mockImplementation(async (_endpoint, key) =>
        key === "bad" ? bad.bytes : good.bytes);

      const result = await collectDiscovery(graffiti.discover<{}>([channel], {}));
      expect(result.entries).toEqual([
        { error: expect.any(Error), origin: inboxEndpoint },
        { object: good.message.m.o },
      ]);
      await vi.waitFor(async () => {
        expect((await graffiti.inboxService.get(inboxEndpoint, bad.message.id))?.l).toBe(4);
      });
      // A proven-invalid message is complete, so it must not keep replaying
      // on every poll and prevent the inbox checkpoint from advancing.
      expect(JSON.parse(result.cursor).cursors[inboxEndpoint]).toEqual(expect.any(String));
      expect((await collectDiscovery(graffiti.continueDiscover<{}>(result.cursor))).entries).toEqual([]);
    });

    test.each(["get", "delete"])("%s propagates an object read error instead of treating it as absence", async (method) => {
      const graffiti = new ValidationGraffiti();
      const { message } = await graffiti.announcement("object");
      serveMessages(graffiti, [message]);
      mockSession(graffiti);
      const failure = new TypeError("Offline");
      vi.spyOn(graffiti.services.buckets, "get").mockRejectedValue(failure);
      const remove = vi.spyOn(graffiti.services.buckets, "delete").mockResolvedValue();

      await expect(method === "get"
        ? graffiti.get<{}>(message.m.o.url, {}, { actor })
        : graffiti.delete(message.m.o.url, { actor }))
        .rejects.toMatchObject({ message: "Could not read object from storage bucket", cause: failure });
      expect(remove).not.toHaveBeenCalled();
    });

    test.each([401, 410])("a public bucket HTTP %s is an object error, not logout or cursor expiry", async (status) => {
      const graffiti = new ValidationGraffiti();
      const { message, bytes } = await graffiti.announcement("object");
      serveMessages(graffiti, [message]);
      const forget = mockSession(graffiti);
      vi.spyOn(graffiti.inboxService, "label").mockResolvedValue();
      const queryFetch = globalThis.fetch;
      let reads = 0;
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (!String(input).startsWith(bucketEndpoint)) return queryFetch(input, init);
        expect(new Headers(init?.headers).has("Authorization")).toBe(false);
        return ++reads === 1 ? new Response("Read failed", { status }) : new Response(bytes.slice());
      }));

      const initial = await collectDiscovery(graffiti.discover<{}>([channel], {}, { actor }));
      expect(initial.entries).toEqual([{ error: expect.any(Error), origin: inboxEndpoint }]);
      now += 1000;
      expect((await collectDiscovery(graffiti.continueDiscover<{}>(initial.cursor, { actor }))).entries)
        .toEqual([{ object: message.m.o }]);
      expect(forget).not.toHaveBeenCalled();
    });

    test("an authenticated inbox failure still forgets the rejected session", async () => {
      const graffiti = new ValidationGraffiti();
      const forget = mockSession(graffiti);
      const failure = new GraffitiErrorUnauthorized("Invalid inbox token");
      vi.spyOn(graffiti.inboxService, "query").mockImplementation(async function* () { throw failure; });
      const result = await collectDiscovery(graffiti.discover<{}>([channel], {}, { actor }));
      expect(result.entries).toEqual([{ error: failure, origin: inboxEndpoint }]);
      expect(forget).toHaveBeenCalledWith(actor);
    });
  });

}
