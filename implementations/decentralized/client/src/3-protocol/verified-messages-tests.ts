import { afterEach, describe, expect, test, vi } from "vitest";
import * as fakeIndexedDB from "fake-indexeddb";
import { VerifiedMessages, type VerifiedMessage } from "./verified-messages";

export function verifiedMessageTests() {
  describe("Verified message cache", () => {
    afterEach(() => vi.unstubAllGlobals());
    test.each(["indexeddb", "memory"])("rejects late validation after deletion and preserves other keys (%s)", async (storage) => {
      if (storage === "indexeddb") {
        for (const [name, value] of Object.entries(fakeIndexedDB)) if (name.startsWith("IDB")) vi.stubGlobal(name, value);
        vi.stubGlobal("indexedDB", new fakeIndexedDB.IDBFactory());
      } else vi.stubGlobal("indexedDB", undefined);
      const cache = new VerifiedMessages();
      const peer = storage === "indexeddb" ? new VerifiedMessages() : cache;
      const url = "graffiti:verified";
      const entry: VerifiedMessage = {
        scope: "did:example:reader", inbox: "https://example.test/inbox", storageKey: "old-key",
        message: { id: "original", m: { t: [], m: new Uint8Array(), o: { url, actor: "did:example:author", channels: [], value: {} } } },
      };
      const generation = (await cache.read(url)).generation;
      expect(await cache.remember(entry, generation)).toBe(true);
      await peer.missing(url, "old-key");
      // A different tab or validation finishing after the deletion cannot undo it.
      expect(await cache.remember(entry, generation)).toBe(false);
      expect((await cache.list(url, entry.scope))[0].missing).toBe(true);

      const rotated = { ...entry, storageKey: "new-key", message: { ...entry.message, id: "rotated" } };
      expect(await peer.remember(rotated, (await peer.read(url)).generation)).toBe(true);
      await cache.missing(url, "old-key");
      expect((await peer.list(url, entry.scope)).filter((item) => !item.missing)).toEqual([rotated]);
      // Private evidence is not reused under another actor or anonymous access.
      expect(await cache.list(url, null)).toEqual([]);
      expect(await cache.list(url, "did:example:someone-else")).toEqual([]);
    });
  });
}
