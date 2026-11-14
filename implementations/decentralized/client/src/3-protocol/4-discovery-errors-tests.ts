import { afterEach, describe, expect, test, vi } from "vitest";
import {
  GraffitiErrorNotFound,
  type GraffitiObjectStream,
} from "@graffiti-garden/api";
import { encode as dagCborEncode, decode as dagCborDecode } from "@ipld/dag-cbor";
import { GraffitiDecentralized } from "./4-graffiti";
import { RECORD_KIND_KEY, RECORD_KIND_MEDIA, type RecordKind } from "./3-object-encoding";
import type { InboxMessage } from "../1-services/4-inboxes";
import { GraffitiErrorUnauthorized } from "../1-services/utilities";

export const inboxEndpoint = "https://example.test/inbox";
export const channel = "discovery-errors";
export const bucketEndpoint = "https://example.test/bucket";
export const actor = "did:web:example.test";
class CursorGraffiti extends GraffitiDecentralized {
  get inboxService() { return this.inboxes; }
}

export class ValidationGraffiti extends CursorGraffiti {
  constructor(defaultInboxEndpoints = [inboxEndpoint]) { super({ defaultInboxEndpoints }); }
  get services() {
    return { buckets: this.storageBuckets, dids: this.dids, sessions: this.sessions };
  }
  async announcement(id: string, kind?: RecordKind) {
    const encoded = await this.objectEncoding.encode<{}>({ value: { text: id }, channels: [channel] }, actor, kind);
    const message: InboxMessage<{}> = {
      id,
      m: { o: encoded.object, t: encoded.tags, m: dagCborEncode({
        k: id, ...(kind === undefined ? {} : { [RECORD_KIND_KEY]: kind }),
      }) },
    };
    return { message, bytes: encoded.objectBytes };
  }
}

export function inboxPage(messages: InboxMessage<{}>[]) {
  return new Response(new Uint8Array(dagCborEncode({
    results: messages, cursor: "after-messages", hasMore: false,
  })));
}

export function serveMessages(graffiti: ValidationGraffiti, messages: InboxMessage<{}>[]) {
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

export function mockSession(graffiti: ValidationGraffiti) {
  vi.spyOn(graffiti.inboxService, "pin").mockResolvedValue();
  vi.spyOn(graffiti.inboxService, "unpin").mockResolvedValue();
  const service = { token: "session-token", authorizationEndpoint: "https://example.test/auth" };
  vi.spyOn(graffiti.services.sessions, "resolveSession").mockReturnValue({
    actor, tokens: [], servicesByAuthorization: [],
    personalInbox: { ...service, serviceEndpoint: inboxEndpoint },
    storageBucket: { ...service, serviceEndpoint: bucketEndpoint },
    sharedInboxes: [],
  });
  return vi.spyOn(graffiti.services.sessions, "forget").mockImplementation(() => {});
}

export async function collectDiscovery(stream: GraffitiObjectStream<{}>) {
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
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    test.each(["initial", "continued"])("retries a temporary object failure after %s discovery", async (start) => {
      const graffiti = new ValidationGraffiti();
      const first = await graffiti.announcement("first");
      const second = await graffiti.announcement("second");
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
      expect(JSON.parse(result.cursor).cursors).toEqual(cursor ? JSON.parse(cursor).cursors : {});
      // Retaining the earlier checkpoint lets the next poll retry the failed
      // object. Replaying the already delivered object is also permitted.
      const recovered = await collectDiscovery(graffiti.continueDiscover<{}>(result.cursor));
      expect(recovered.entries).toEqual([{ object: first.message.m.o }, { object: second.message.m.o }]);
      expect(JSON.parse(recovered.cursor).cursors[inboxEndpoint]).toEqual(expect.any(String));
      expect(read).toHaveBeenCalledTimes(3);
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
      const recovered = await collectDiscovery(graffiti.continueDiscover<{}>(initial.cursor));
      expect(recovered.entries).toEqual([{ object: good.message.m.o }]);
      expect(read).toHaveBeenCalledTimes(3);
    });

    test.each(["DID lookup", "missing service"])("does not cache a failed %s as a deletion", async (failure) => {
      const graffiti = new ValidationGraffiti();
      const { message, bytes } = await graffiti.announcement("object");
      serveMessages(graffiti, [message]);
      const resolve = vi.mocked(graffiti.services.dids.resolve);
      if (failure === "DID lookup") resolve.mockRejectedValueOnce(new GraffitiErrorNotFound("Resolver offline"));
      else resolve.mockResolvedValueOnce({ id: actor });
      vi.spyOn(graffiti.services.buckets, "get").mockResolvedValue(bytes);

      const initial = await collectDiscovery(graffiti.discover<{}>([channel], {}));
      expect(initial.entries).toEqual([{ error: expect.any(Error), origin: inboxEndpoint }]);
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
      expect((await collectDiscovery(graffiti.continueDiscover<{}>(initial.cursor))).entries)
        .toEqual([{ object: first.message.m.o }, { object: second.message.m.o }]);
      expect(reads).toBe(2);
    });

    test.each(["contents", "metadata"])("reports invalid %s without stopping discovery or holding its checkpoint", async (invalid) => {
      const graffiti = new ValidationGraffiti();
      const bad = await graffiti.announcement("bad");
      const good = await graffiti.announcement("good");
      if (invalid === "contents") bad.message.m.o.value = { forged: true };
      else bad.message.m.m = dagCborEncode({});
      serveMessages(graffiti, [bad.message, good.message]);
      vi.spyOn(graffiti.services.buckets, "get").mockImplementation(async (_endpoint, key) =>
        key === "bad" ? bad.bytes : good.bytes);

      const result = await collectDiscovery(graffiti.discover<{}>([channel], {}));
      expect(result.entries).toEqual([
        { error: expect.any(Error), origin: inboxEndpoint },
        { object: good.message.m.o },
      ]);
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
      const queryFetch = globalThis.fetch;
      let reads = 0;
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (!String(input).startsWith(bucketEndpoint)) return queryFetch(input, init);
        expect(new Headers(init?.headers).has("Authorization")).toBe(false);
        return ++reads === 1 ? new Response("Read failed", { status }) : new Response(bytes.slice());
      }));

      const initial = await collectDiscovery(graffiti.discover<{}>([channel], {}, { actor }));
      expect(initial.entries).toEqual([{ error: expect.any(Error), origin: inboxEndpoint }]);
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
