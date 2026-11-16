import { describe, expect, test } from "vitest";
import { encode as dagCborEncode, decode as dagCborDecode } from "@ipld/dag-cbor";
import { looseObject, number, literal } from "zod/mini";
import { Inboxes, MessageResultSchema } from "./4-inboxes";
import { DecentralizedTestEnvironment, decentralizedSharedInbox, decentralizedTestUsers } from "../../test/environment";

const Cursor = looseObject({ version: literal(1), createdAt: number(), sinceSeq: number() });
const decodeCursor = (cursor: string) => Cursor.parse(dagCborDecode(Buffer.from(cursor, "base64url")));
const encodeCursor = (cursor: ReturnType<typeof decodeCursor>) => Buffer.from(dagCborEncode(cursor)).toString("base64url");

export function inboxRetentionTests(environment: DecentralizedTestEnvironment) {
  describe("Inbox retention", () => {
    const inboxes = new Inboxes();
    const [owner, other] = decentralizedTestUsers;
    const message = (tag = crypto.getRandomValues(new Uint8Array(32))) => ({
      t: [tag], m: new Uint8Array(),
      o: { url: `graffiti:${crypto.randomUUID()}`, actor: owner.actor, channels: [], value: {} },
    });
    const request = (endpoint: string, body: unknown, token?: string) => fetch(`${endpoint}/query`, {
      method: "POST", headers: { "Content-Type": "application/cbor", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: dagCborEncode(body).slice(),
    });
    const query = async (endpoint: string, body: unknown, token?: string) => {
      const response = await request(endpoint, body, token);
      expect(response.status).toBe(200);
      return MessageResultSchema.parse(dagCborDecode(await response.arrayBuffer()));
    };

    test("expires only unpinned shared entries; preserves personal and unaudited legacy entries", async () => {
      const shared = message();
      const pinned = message();
      const personal = message();
      const legacy = message();
      const ids = await Promise.all([
        inboxes.send(decentralizedSharedInbox, shared), inboxes.send(decentralizedSharedInbox, pinned),
        inboxes.send(owner.inboxEndpoint, personal), inboxes.send(decentralizedSharedInbox, legacy),
      ]);
      await inboxes.pin(decentralizedSharedInbox, [ids[1]], owner.token);
      await inboxes.pin(decentralizedSharedInbox, [ids[1]], other.token);
      const db = await environment.database();
      for (const id of ids) await db.prepare("UPDATE inbox_messages SET created_at = ? WHERE message_id = ?")
        .bind(id === ids[3] ? null : 0, id).run();
      const tags = [...shared.t, ...pinned.t, ...legacy.t];
      expect((await query(decentralizedSharedInbox, { tags, schema: {} })).results.map((m) => m.id)).toEqual([ids[1], ids[3]]);
      expect((await query(owner.inboxEndpoint, { tags: personal.t, schema: {} }, owner.token)).results.map((m) => m.id)).toEqual([ids[2]]);
      // An expired entry cannot be rescued by a late pin, even before physical GC.
      await expect(inboxes.pin(decentralizedSharedInbox, [ids[0]], owner.token)).rejects.toThrow();
      // Including a live entry must not turn that failure into partial pinning.
      await expect(inboxes.pin(decentralizedSharedInbox, [ids[0], ids[3]], owner.token)).rejects.toThrow();
      expect(await db.prepare(`SELECT p.message_seq FROM inbox_message_pins p
        JOIN inbox_messages m ON m.message_seq = p.message_seq WHERE m.message_id = ?`)
        .bind(ids[3]).first()).toBeNull();
      await inboxes.unpin(decentralizedSharedInbox, [ids[1]], owner.token);
      expect((await query(decentralizedSharedInbox, { tags, schema: {} })).results.map((m) => m.id)).toContain(ids[1]);
      await inboxes.unpin(decentralizedSharedInbox, [ids[1]], other.token);
      expect((await query(decentralizedSharedInbox, { tags, schema: {} })).results.map((m) => m.id)).toEqual([ids[3]]);
      await environment.collectExpiredMessages();
      for (const id of ids.slice(0, 2)) {
        expect(await db.prepare("SELECT message_id FROM inbox_messages WHERE message_id = ?").bind(id).first()).toBeNull();
      }
      for (const id of ids.slice(2)) {
        expect(await db.prepare("SELECT message_id FROM inbox_messages WHERE message_id = ?").bind(id).first()).not.toBeNull();
      }
    });

    test("a live duplicate retains its arrival deadline; an expired resend receives a new ID and position", async () => {
      const sending = message();
      const first = await inboxes.send(decentralizedSharedInbox, sending);
      const db = await environment.database();
      const row = () => db.prepare("SELECT message_seq, created_at FROM inbox_messages WHERE message_id = ?")
        .bind(first).first<{ message_seq: number; created_at: number }>();
      const before = await row();
      expect(before!.created_at).toBeGreaterThan(Date.now() - 60_000);
      expect(await inboxes.send(decentralizedSharedInbox, sending)).toBe(first);
      expect(await row()).toEqual(before);
      const initial = await query(decentralizedSharedInbox, { tags: sending.t, schema: {} });
      await db.prepare("UPDATE inbox_messages SET created_at = 0 WHERE message_id = ?").bind(first).run();
      const replacement = await inboxes.send(decentralizedSharedInbox, sending);
      expect(replacement).not.toBe(first);
      const cursor = encodeCursor({ ...decodeCursor(initial.cursor), waitTil: 0 });
      expect((await query(decentralizedSharedInbox, { cursor })).results.map((m) => m.id)).toEqual([replacement]);
    });

    test("garbage collection cannot reuse the highest cursor position", async () => {
      const sending = message();
      const id = await inboxes.send(decentralizedSharedInbox, sending);
      const db = await environment.database();
      const old = await db.prepare("SELECT message_seq FROM inbox_messages WHERE message_id = ?").bind(id).first<{ message_seq: number }>();
      await db.prepare("UPDATE inbox_messages SET created_at = 0 WHERE message_id = ?").bind(id).run();
      await environment.collectExpiredMessages();
      const next = await inboxes.send(decentralizedSharedInbox, message(sending.t[0]));
      const current = await db.prepare("SELECT message_seq FROM inbox_messages WHERE message_id = ?").bind(next).first<{ message_seq: number }>();
      expect(current!.message_seq).toBeGreaterThan(old!.message_seq);
    });

    test("renews the cursor only when a paged scan catches up", async () => {
      const tag = crypto.getRandomValues(new Uint8Array(32));
      await Promise.all(Array.from({ length: 112 }, () => inboxes.send(decentralizedSharedInbox, message(tag))));
      const first = await query(decentralizedSharedInbox, { tags: [tag], schema: {} });
      expect(first.hasMore).toBe(true);
      const oldAnchor = Date.now() - 24 * 60 * 60 * 1000;
      const second = await query(decentralizedSharedInbox, { cursor: encodeCursor({ ...decodeCursor(first.cursor), createdAt: oldAnchor }) });
      expect(second.hasMore).toBe(true);
      expect(decodeCursor(second.cursor).createdAt).toBe(oldAnchor);
      const final = await query(decentralizedSharedInbox, { cursor: second.cursor });
      expect(final.hasMore).toBe(false);
      expect(decodeCursor(final.cursor).createdAt).toBeGreaterThan(oldAnchor);
      const expired = encodeCursor({ ...decodeCursor(final.cursor), createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000 - 1, waitTil: 0 });
      expect((await request(decentralizedSharedInbox, { cursor: expired })).status).toBe(410);
    });

    test("rolls back the message if inserting its tag index fails", async () => {
      const sending = message();
      const db = await environment.database();
      const hexTag = Buffer.from(sending.t[0]).toString("hex");
      await db.prepare(`CREATE TRIGGER reject_test_tag BEFORE INSERT ON inbox_message_tags
        WHEN NEW.tag = X'${hexTag}' BEGIN SELECT RAISE(ABORT, 'Test index failure'); END`).run();
      try {
        await expect(inboxes.send(decentralizedSharedInbox, sending)).rejects.toThrow();
        expect(await db.prepare("SELECT message_id FROM inbox_messages WHERE json_extract(object, '$.url') = ?").bind(sending.o.url).first()).toBeNull();
      } finally {
        await db.prepare("DROP TRIGGER reject_test_tag").run();
      }
      const id = await inboxes.send(decentralizedSharedInbox, sending);
      expect((await query(decentralizedSharedInbox, { tags: sending.t, schema: {} })).results.map((m) => m.id)).toEqual([id]);
    });
  });
}
