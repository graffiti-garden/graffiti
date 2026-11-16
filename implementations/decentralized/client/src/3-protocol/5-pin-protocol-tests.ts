import { afterEach, describe, expect, test, vi } from "vitest";
import { encode as dagCborEncode } from "@ipld/dag-cbor";
import { GraffitiErrorCursorExpired, GraffitiErrorNotFound } from "@graffiti-garden/api";
import { ValidationGraffiti, serveMessages, inboxPage, collectDiscovery, mockSession, inboxEndpoint, actor, channel } from "./5-discovery-errors-tests";
import type { InboxMessage } from "../1-services/4-inboxes";
import type { GraffitiSession } from "@graffiti-garden/api";
import type { GraffitiDecentralized } from "./5-graffiti";
import type { DecentralizedTestEnvironment } from "../../test/environment";

function hint(message: InboxMessage<{}>): InboxMessage<{}> {
  return { id: "hint", m: { ...message.m, m: dagCborEncode({ d: true }), o: { ...message.m.o, value: { forged: true } } } };
}

export function pinProtocolTests() {
  describe("Pinning and deletion protocol", () => {
    afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

    test("ignores hints for objects which were never verified", async () => {
      const graffiti = new ValidationGraffiti();
      const original = await graffiti.announcement("original");
      serveMessages(graffiti, [hint(original.message)]);
      const read = vi.spyOn(graffiti.services.buckets, "get");
      expect((await collectDiscovery(graffiti.discover([channel], {}))).entries).toEqual([]);
      expect(read).not.toHaveBeenCalled();
    });

    test("a false hint cannot delete an existing verified object", async () => {
      const graffiti = new ValidationGraffiti();
      const original = await graffiti.announcement("original");
      serveMessages(graffiti, [original.message]);
      vi.spyOn(graffiti.services.buckets, "get").mockResolvedValue(original.bytes);
      const initial = await collectDiscovery(graffiti.discover([channel], {}));
      vi.mocked(fetch).mockResolvedValueOnce(inboxPage([hint(original.message)]));
      expect((await collectDiscovery(graffiti.continueDiscover(initial.cursor))).entries).toEqual([]);
      expect((await collectDiscovery(graffiti.discover([channel], {}))).entries).toEqual([{ object: original.message.m.o }]);
    });

    test("retries a failed deletion check and emits the verified original, not the hint payload", async () => {
      const graffiti = new ValidationGraffiti();
      const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now());
      const original = await graffiti.announcement("original");
      serveMessages(graffiti, [original.message]);
      const read = vi.spyOn(graffiti.services.buckets, "get").mockResolvedValue(original.bytes);
      const initial = await collectDiscovery(graffiti.discover([channel], {}));
      vi.mocked(fetch).mockResolvedValueOnce(inboxPage([hint(original.message)]));
      read.mockRejectedValueOnce(new TypeError("Offline"));
      const failed = await collectDiscovery(graffiti.continueDiscover(initial.cursor));
      expect(failed.entries).toEqual([{ error: expect.any(Error), origin: inboxEndpoint }]);
      // Inbox progress is committed; only the failed URL check remains pending.
      expect(JSON.parse(failed.cursor).cursors).not.toEqual(JSON.parse(initial.cursor).cursors);
      expect(JSON.parse(failed.cursor).hints).toHaveLength(1);
      const attempts = read.mock.calls.length;
      await collectDiscovery(graffiti.continueDiscover(failed.cursor));
      expect(read).toHaveBeenCalledTimes(attempts);
      clock.mockReturnValue(Date.now() + 1000);

      read.mockRejectedValue(new GraffitiErrorNotFound("Gone"));
      const deleted = await collectDiscovery(graffiti.continueDiscover(failed.cursor));
      expect(deleted.entries).toEqual([{ tombstone: true, object: original.message.m.o }]);
      // A raw cached page cannot resurrect the verified missing location.
      expect((await collectDiscovery(graffiti.discover([channel], {}, { refresh: false }))).entries)
        .toEqual([{ tombstone: true, object: original.message.m.o }]);
      // Losing evidence while a check is pending must expire the cursor,
      // not silently discard the deletion that this consumer still needs.
      vi.spyOn(graffiti.services.verification, "read").mockResolvedValue([]);
      await expect(collectDiscovery(graffiti.continueDiscover(failed.cursor)))
        .rejects.toBeInstanceOf(GraffitiErrorCursorExpired);
    });

    test("bounds deferred deletion checks without replaying healthy announcements", async () => {
      const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now());
      const graffiti = new ValidationGraffiti();
      const originals = await Promise.all(Array.from({ length: 34 }, (_, i) => graffiti.announcement(`object-${i}`)));
      serveMessages(graffiti, originals.map(original => original.message));
      const read = vi.spyOn(graffiti.services.buckets, "get").mockImplementation(async (_endpoint, key) =>
        originals.find(original => original.message.id === key)!.bytes);
      const initial = await collectDiscovery(graffiti.discover([channel], {}));
      vi.mocked(fetch).mockResolvedValueOnce(inboxPage(originals.map(({ message }) => ({ ...hint(message), id: `hint-${message.id}` }))));
      read.mockRejectedValue(new TypeError("Offline"));
      const failed = await collectDiscovery(graffiti.continueDiscover(initial.cursor));
      expect(JSON.parse(failed.cursor).hints).toHaveLength(34);
      read.mockClear();
      clock.mockReturnValue(Date.now() + 1000);
      const retry = await collectDiscovery(graffiti.continueDiscover(failed.cursor));
      expect(read).toHaveBeenCalledTimes(32);
      expect(retry.entries.every(entry => entry.error)).toBe(true);
      // The two skipped checks are still due; repeated failures back off.
      read.mockClear();
      await collectDiscovery(graffiti.continueDiscover(retry.cursor));
      expect(read).toHaveBeenCalledTimes(2);
    });

    test("holds an early hint through validation and keeps a rotated storage key", async () => {
      const graffiti = new ValidationGraffiti();
      const original = await graffiti.announcement("original");
      serveMessages(graffiti, [original.message]);
      const read = vi.spyOn(graffiti.services.buckets, "get").mockResolvedValue(original.bytes);
      const initial = await collectDiscovery(graffiti.discover([channel], {}));
      const rotated: InboxMessage<{}> = { ...original.message, id: "rotated", m: { ...original.message.m, m: dagCborEncode({ k: "rotated" }) } };
      vi.mocked(fetch).mockResolvedValueOnce(inboxPage([hint(original.message), rotated]));
      read.mockImplementation(async (_endpoint, key) => {
        if (key === "original") throw new GraffitiErrorNotFound("Old key gone");
        return original.bytes;
      });
      const moved = await collectDiscovery(graffiti.continueDiscover(initial.cursor));
      expect(moved.entries).toEqual([{ object: original.message.m.o }]);
      expect((await collectDiscovery(graffiti.discover([channel], {}, { refresh: false }))).entries)
        .toEqual([{ object: original.message.m.o }]);
    });

    test("an unverified 404 remains retryable without manufacturing a tombstone", async () => {
      const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now());
      const graffiti = new ValidationGraffiti();
      const original = await graffiti.announcement("original");
      serveMessages(graffiti, [original.message]);
      vi.spyOn(graffiti.services.buckets, "get")
        .mockRejectedValueOnce(new GraffitiErrorNotFound("Not at cached endpoint"))
        .mockResolvedValue(original.bytes);
      const first = await collectDiscovery(graffiti.discover([channel], {}));
      expect(first.entries).toEqual([]);
      expect(JSON.parse(JSON.parse(first.cursor).cursors[inboxEndpoint]).pending).toHaveLength(1);
      clock.mockReturnValue(Date.now() + 1000);
      expect((await collectDiscovery(graffiti.continueDiscover(first.cursor))).entries).toEqual([{ object: original.message.m.o }]);
    });

    test("keeps a new key verified by another discovery while a deletion check waits", async () => {
      const graffiti = new ValidationGraffiti();
      const original = await graffiti.announcement("original");
      serveMessages(graffiti, [original.message]);
      const read = vi.spyOn(graffiti.services.buckets, "get").mockResolvedValue(original.bytes);
      const initial = await collectDiscovery(graffiti.discover([channel], {}));
      const rotated: InboxMessage<{}> = { ...original.message, id: "rotated", m: { ...original.message.m, m: dagCborEncode({ k: "rotated" }) } };

      // One discovery starts checking the old key. A different query learns
      // and verifies the replacement while that storage response is pending.
      let finishOldRead!: () => void;
      read.mockImplementation(async (_endpoint, key) => key === "rotated"
        ? original.bytes
        : new Promise<Uint8Array>((_resolve, reject) => {
            finishOldRead = () => reject(new GraffitiErrorNotFound("Old key gone"));
          }));
      vi.mocked(fetch).mockResolvedValueOnce(inboxPage([hint(original.message)]));
      const checking = collectDiscovery(graffiti.continueDiscover(initial.cursor));
      await vi.waitFor(() => expect(finishOldRead).toBeDefined());
      vi.mocked(fetch).mockResolvedValueOnce(inboxPage([rotated]));
      expect((await collectDiscovery(graffiti.discover<{}>([channel], { required: ["value"] }))).entries)
        .toEqual([{ object: original.message.m.o }]);

      // The old 404 is authoritative for its key, but cannot remove the live URL.
      finishOldRead();
      expect((await checking).entries).toEqual([]);
    });

    test("stops replaying an unknown missing announcement after normal DID cache expiry", async () => {
      const graffiti = new ValidationGraffiti();
      const original = await graffiti.announcement("original");
      serveMessages(graffiti, [original.message]);
      vi.spyOn(graffiti.services.buckets, "get").mockRejectedValue(new GraffitiErrorNotFound("Gone"));
      const clock = vi.spyOn(Date, "now").mockReturnValue(0);
      const first = await collectDiscovery(graffiti.discover([channel], {}));
      clock.mockReturnValue(60 * 60 * 1000);
      const next = await collectDiscovery(graffiti.continueDiscover(first.cursor));
      expect(next.entries).toEqual([]);
      expect(JSON.parse(next.cursor).cursors[inboxEndpoint]).toEqual(expect.any(String));
    });

    test("waits for another inbox's new key before acting on a deletion hint", async () => {
      const otherInbox = "https://example.test/other-inbox";
      const graffiti = new ValidationGraffiti([inboxEndpoint, otherInbox]);
      const original = await graffiti.announcement("original");
      serveMessages(graffiti, [original.message]);
      let rotating = false;
      const rotated: InboxMessage<{}> = { ...original.message, id: "rotated", m: { ...original.message.m, m: dagCborEncode({ k: "rotated" }) } };
      vi.mocked(fetch).mockImplementation(async (url) => inboxPage(String(url) === `${inboxEndpoint}/query`
        ? [rotating ? hint(original.message) : original.message] : rotating ? [rotated] : []));
      let release!: (bytes: Uint8Array) => void;
      vi.spyOn(graffiti.services.buckets, "get").mockImplementation(async (_endpoint, key) => {
        if (!rotating) return original.bytes;
        if (key === "original") throw new GraffitiErrorNotFound("Old key gone");
        // Only validation waits. The final liveness check reads it normally.
        if (!release) return new Promise<Uint8Array>((resolve) => { release = resolve; });
        return original.bytes;
      });
      const first = await collectDiscovery(graffiti.discover([channel], {}));
      rotating = true;
      const pending = collectDiscovery(graffiti.continueDiscover(first.cursor));
      await vi.waitFor(() => expect(release).toBeDefined());
      release(original.bytes);
      expect((await pending).entries).toEqual([{ object: original.message.m.o }]);
    });

    test("batches personal pins, reports failure after valid results, and retries next poll", async () => {
      const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now());
      const graffiti = new ValidationGraffiti();
      const first = await graffiti.announcement("first");
      const second = await graffiti.announcement("second");
      serveMessages(graffiti, [first.message, second.message]);
      mockSession(graffiti);
      vi.spyOn(graffiti.services.buckets, "get").mockImplementation(async (_endpoint, key) => key === "first" ? first.bytes : second.bytes);
      const pin = vi.mocked(graffiti.inboxService.pin).mockRejectedValueOnce(new Error("Offline"));
      const initial = await collectDiscovery(graffiti.discover([channel], {}, { session: { actor } }));
      expect(initial.entries).toEqual([{ object: first.message.m.o }, { object: second.message.m.o }, { error: expect.any(Error), origin: inboxEndpoint }]);
      expect(pin).toHaveBeenCalledExactlyOnceWith(inboxEndpoint, ["first", "second"], "session-token");
      expect(JSON.parse(JSON.parse(initial.cursor).cursors[inboxEndpoint]).pins.ids).toEqual(["first", "second"]);
      // A fast poll neither repeats the failed pin nor replays healthy objects.
      await collectDiscovery(graffiti.continueDiscover(initial.cursor, { session: { actor } }));
      expect(pin).toHaveBeenCalledTimes(1);
      clock.mockReturnValue(Date.now() + 1000);
      const recovered = await collectDiscovery(graffiti.continueDiscover(initial.cursor, { session: { actor } }));
      expect(recovered.entries).toEqual([]);
      expect(pin).toHaveBeenCalledTimes(2);
      await collectDiscovery(graffiti.discover([channel], {}, { session: { actor } }));
      expect(pin).toHaveBeenCalledTimes(2); // Sticky pins do not need renewal.
    });

    test.each(["object", "media"])("waits for pinning and rolls back %s storage on failure", async (kind) => {
      const graffiti = new ValidationGraffiti();
      mockSession(graffiti);
      vi.spyOn(graffiti.inboxService, "send").mockResolvedValue("sent");
      const put = vi.spyOn(graffiti.services.buckets, "put").mockResolvedValue();
      const remove = vi.spyOn(graffiti.services.buckets, "delete").mockResolvedValue();
      let rejectPin!: (reason: Error) => void;
      vi.mocked(graffiti.inboxService.pin).mockImplementation(() => new Promise((_resolve, reject) => { rejectPin = reject; }));
      const pending = kind === "object"
        ? graffiti.post({ value: {}, channels: [] }, { actor })
        : graffiti.postMedia({ data: new Blob(["media"]) }, { actor });
      let complete = false;
      void pending.then(() => { complete = true; }, () => { complete = true; });
      await vi.waitFor(() => expect(rejectPin).toBeDefined());
      expect(complete).toBe(false);
      rejectPin(new Error("Pin failed"));
      await expect(pending).rejects.toThrow("Pin failed");
      expect(graffiti.inboxService.unpin).toHaveBeenCalledWith(inboxEndpoint, ["sent"], "session-token");
      expect(remove.mock.calls.map((call) => call[1]).sort()).toEqual(put.mock.calls.map((call) => call[1]).sort());
    });

    test("pins delivered personal messages when the consumer closes early", async () => {
      const graffiti = new ValidationGraffiti();
      const original = await graffiti.announcement("original");
      serveMessages(graffiti, [original.message]);
      mockSession(graffiti);
      vi.spyOn(graffiti.services.buckets, "get").mockResolvedValue(original.bytes);
      const stream = graffiti.discover([channel], {}, { session: { actor } });
      expect((await stream.next()).value).toEqual({ object: original.message.m.o });
      await stream.return({ cursor: "" });
      expect(graffiti.inboxService.pin).toHaveBeenCalledWith(inboxEndpoint, ["original"], "session-token");
    });
  });
}

export function pinPolicyIntegrationTests(
  environment: DecentralizedTestEnvironment,
  useGraffiti: () => GraffitiDecentralized,
  sessions: () => GraffitiSession[],
) {
  describe("Automatic pin policy", () => {
    const sponsors = async (url: string) => (await environment.database()).prepare(`
      SELECT i.account_id AS owner, p.account_id AS sponsor
      FROM inbox_message_pins p JOIN inbox_messages m ON m.message_seq = p.message_seq
      JOIN inboxes i ON i.inbox_seq = m.inbox_seq
      WHERE json_extract(m.object, '$.url') = ? ORDER BY owner, sponsor
    `).bind(url).all<{ owner: number; sponsor: number }>();

    test("the author pins shared messages; other readers do not sponsor them", async () => {
      const [author, reader] = sessions();
      const writer = useGraffiti();
      const object = await writer.post({ value: {}, channels: [crypto.randomUUID()] }, author);
      expect((await sponsors(object.url)).results).toEqual([{ owner: 0, sponsor: 1 }, { owner: 1, sponsor: 1 }]);
      await collectDiscovery(useGraffiti().discover(object.channels, {}, { session: reader }));
      expect((await sponsors(object.url)).results).toEqual([{ owner: 0, sponsor: 1 }, { owner: 1, sponsor: 1 }]);
      await writer.delete(object, author);
      expect((await sponsors(object.url)).results).toEqual([]);
    });

    test("the recipient pins validated personal messages and releases confirmed deletions", async () => {
      const [author, recipient] = sessions();
      const writer = useGraffiti();
      const reader = useGraffiti();
      const object = await writer.post({ value: {}, channels: [crypto.randomUUID()], allowed: [recipient.actor] }, author);
      expect((await sponsors(object.url)).results).toEqual([{ owner: 1, sponsor: 1 }]);
      const initial = await collectDiscovery(reader.discover(object.channels, {}, { session: recipient }));
      expect((await sponsors(object.url)).results).toEqual([{ owner: 1, sponsor: 1 }, { owner: 2, sponsor: 2 }]);
      await writer.delete(object, author);
      await collectDiscovery(reader.continueDiscover(initial.cursor, { session: recipient }));
      expect((await sponsors(object.url)).results).toEqual([]);
    });
  });
}
