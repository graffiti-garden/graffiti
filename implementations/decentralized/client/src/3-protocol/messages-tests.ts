import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as fakeIndexedDB from "fake-indexeddb";
import { ProtocolMessages, type MessageState } from "./messages";

const entry: MessageState = {
  scope: null,
  inbox: "https://example.test/inbox",
  storageKey: "original-key",
  status: "pending",
  message: {
    id: "announcement",
    m: {
      o: { url: "graffiti:object", actor: "did:example:actor", value: {}, channels: [] },
      m: new Uint8Array([1]), t: [],
    },
  },
};

export function protocolMessageTests() {
  describe.each(["indexeddb", "memory"])("Protocol messages (%s)", storage => {
    beforeEach(() => {
      for (const [name, value] of Object.entries(fakeIndexedDB)) {
        if (name.startsWith("IDB")) vi.stubGlobal(name, value);
      }
      vi.stubGlobal("indexedDB", storage === "memory" ? undefined : new fakeIndexedDB.IDBFactory());
    });
    afterEach(() => vi.unstubAllGlobals());

    test("keeps verification when another consumer's earlier failed read finishes", async () => {
      const first = new ProtocolMessages();
      const second = storage === "memory" ? first : new ProtocolMessages();
      await first.remember(entry);
      await second.remember({ ...entry, status: "verified" });
      expect(await first.remember(entry)).toBe("verified");
      const snapshot = await first.read(entry.message.m.o.url);
      snapshot[0].message.m.o.value.changed = true;
      expect(await second.read(entry.message.m.o.url)).toEqual([{ ...entry, status: "verified" }]);
    });

    test("keeps deletion ahead of late verification without deleting a different storage key", async () => {
      const first = new ProtocolMessages();
      const second = storage === "memory" ? first : new ProtocolMessages();
      await first.remember({ ...entry, status: "verified" });
      await first.deleted(entry.message.m.o.url, entry.storageKey);
      // This read began in another tab/reader scope before deletion was known.
      expect(await second.remember({ ...entry, scope: "did:example:reader", status: "verified" })).toBe("deleted");
      // Rotating an object to a new key is a separate announcement.
      const rotated = { ...entry, storageKey: "new-key", message: { ...entry.message, id: "rotated" }, status: "verified" } as const;
      expect(await second.remember(rotated)).toBe("verified");
      expect((await first.read(entry.message.m.o.url)).map(m => m.status)).toEqual(["deleted", "deleted", "verified"]);
    });

    test("does not apply a cached verification to a changed message with the same ID", async () => {
      const cache = new ProtocolMessages();
      await cache.remember({ ...entry, status: "verified" });
      const forged = structuredClone(entry);
      forged.message.m.o.value.forged = true;
      await expect(cache.remember(forged)).rejects.toThrow("Inbox changed an existing announcement");
      expect(await cache.read(entry.message.m.o.url)).toEqual([{ ...entry, status: "verified" }]);
    });
  });
}
