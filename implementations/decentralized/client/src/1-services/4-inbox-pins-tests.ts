import { describe, expect, test } from "vitest";
import { encode as dagCborEncode } from "@ipld/dag-cbor";
import { Inboxes } from "./4-inboxes";
import { DecentralizedTestEnvironment, decentralizedSharedInbox, decentralizedTestUsers } from "../../test/environment";

export function inboxPinTests(environment: DecentralizedTestEnvironment) {
  describe("Inbox pins", () => {
    const [owner, other] = decentralizedTestUsers;
    const inboxes = new Inboxes();
    const send = (endpoint: string) => inboxes.send(endpoint, {
      t: [crypto.getRandomValues(new Uint8Array(32))],
      o: { url: `graffiti:${crypto.randomUUID()}`, actor: owner.actor, channels: [], value: {} },
      m: new Uint8Array(),
    });
    const update = (endpoint: string, operation: "pin" | "unpin", ids: string[], token?: string) => fetch(`${endpoint}/${operation}`, {
      method: "POST",
      headers: { "Content-Type": "application/cbor", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: dagCborEncode({ ids }).slice(),
    });
    const pins = async (id: string) => (await environment.database()).prepare(`
      SELECT p.account_id FROM inbox_message_pins p
      JOIN inbox_messages m ON m.message_seq = p.message_seq
      WHERE m.message_id = ? ORDER BY p.account_id
    `).bind(id).all<{ account_id: number }>();

    test("send remains anonymous; only the owner can pin a personal inbox", async () => {
      const id = await send(owner.inboxEndpoint);
      // Delivery to another person's inbox requires neither read access nor a pin.
      expect((await pins(id)).results).toEqual([]);
      expect((await update(owner.inboxEndpoint, "pin", [id])).status).toBe(401);
      expect((await update(owner.inboxEndpoint, "pin", [id], other.token)).status).toBe(403);
      expect((await update(owner.inboxEndpoint, "pin", [id], owner.token)).status).toBe(204);
      expect((await pins(id)).results).toEqual([{ account_id: owner.accountId }]);
    });

    test("pins are idempotent and accounts can only remove their own", async () => {
      const id = await send(decentralizedSharedInbox);
      const db = await environment.database();
      const createdAt = () => db.prepare(`
        SELECT p.created_at FROM inbox_message_pins p
        JOIN inbox_messages m ON m.message_seq = p.message_seq
        WHERE m.message_id = ? AND p.account_id = ?
      `).bind(id, owner.accountId).first<number>("created_at");
      const beforePin = Date.now();
      expect((await update(decentralizedSharedInbox, "pin", [id], owner.token)).status).toBe(204);
      const initialTimestamp = await createdAt();
      expect(initialTimestamp).toBeGreaterThanOrEqual(beforePin);
      expect(initialTimestamp).toBeLessThanOrEqual(Date.now());

      // Age this pin so timestamp preservation cannot pass accidentally when
      // two requests happen during the same millisecond.
      await db.prepare(`UPDATE inbox_message_pins SET created_at = 0
        WHERE account_id = ? AND message_seq IN (
          SELECT message_seq FROM inbox_messages WHERE message_id = ?
        )`).bind(owner.accountId, id).run();
      for (const token of [owner.token, other.token]) {
        expect((await update(decentralizedSharedInbox, "pin", [id, id], token)).status).toBe(204);
      }
      expect((await pins(id)).results).toEqual([{ account_id: owner.accountId }, { account_id: other.accountId }]);
      expect(await createdAt()).toBe(0);
      for (let i = 0; i < 2; i++) {
        expect((await update(decentralizedSharedInbox, "unpin", [id, "missing"], owner.token)).status).toBe(204);
      }
      // Removing one sponsor cannot remove another sponsor's pin or the message.
      expect((await pins(id)).results).toEqual([{ account_id: other.accountId }]);

      // Repinning starts a new sponsorship with a fresh creation time.
      const beforeRepin = Date.now();
      expect((await update(decentralizedSharedInbox, "pin", [id], owner.token)).status).toBe(204);
      const repinnedTimestamp = await createdAt();
      expect(repinnedTimestamp).toBeGreaterThanOrEqual(beforeRepin);
      expect(repinnedTimestamp).toBeLessThanOrEqual(Date.now());
    });

    test("rejects a batch containing a missing or foreign-inbox message atomically", async () => {
      const id = await send(decentralizedSharedInbox);
      const foreign = await send(owner.inboxEndpoint);
      for (const missing of ["missing", foreign]) {
        expect((await update(decentralizedSharedInbox, "pin", [id, missing], owner.token)).status).toBe(404);
        expect((await pins(id)).results).toEqual([]);
      }
    });

    test("bounds batches and accepts the full batch without exceeding SQL parameter limits", async () => {
      const ids = await Promise.all(Array.from({ length: 100 }, () => send(decentralizedSharedInbox)));
      expect((await update(decentralizedSharedInbox, "pin", [], owner.token)).status).toBe(400);
      expect((await update(decentralizedSharedInbox, "pin", [...ids, "extra"], owner.token)).status).toBe(400);
      expect((await update(decentralizedSharedInbox, "pin", ids, owner.token)).status).toBe(204);
      for (const id of ids) expect((await pins(id)).results).toEqual([{ account_id: owner.accountId }]);
    });
  });
}
