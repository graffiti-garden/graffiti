import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mockCacheStorage } from "./cache-tests";
import { VerificationState, type MessageState } from "./verification-state";

const url = "graffiti:object";
const entry: MessageState = {
  scope: null,
  inbox: "https://example.test/inbox",
  storageKey: "original-key",
  status: "pending",
  id: "announcement",
  digest: "original-body",
};

export function verificationStateTests() {
  describe.each(["cache", "memory"])("Verification state (%s)", storage => {
    beforeEach(() => {
      if (storage === "cache") mockCacheStorage();
      else vi.stubGlobal("caches", undefined);
    });
    afterEach(() => vi.unstubAllGlobals());

    test("keeps verification when another consumer's earlier failed read finishes", async () => {
      const first = new VerificationState();
      const second = storage === "memory" ? first : new VerificationState();
      await first.remember(url, entry);
      await second.remember(url, { ...entry, status: "verified" });
      expect(await first.remember(url, entry)).toBe("verified");
      const snapshot = await first.read(url);
      snapshot[0].storageKey = "mutated";
      expect(await second.read(url)).toEqual([{ ...entry, status: "verified" }]);
    });

    test("keeps deletion ahead of late verification without deleting a different storage key", async () => {
      const first = new VerificationState();
      const second = storage === "memory" ? first : new VerificationState();
      await first.remember(url, { ...entry, status: "verified" });
      await first.deleted(url, entry.storageKey);
      // This read began in another tab/reader scope before deletion was known.
      expect(await second.remember(url, { ...entry, scope: "did:example:reader", status: "verified" })).toBe("deleted");
      // Rotating an object to a new key is a separate announcement.
      const rotated = { ...entry, storageKey: "new-key", id: "rotated", digest: "rotated-body", status: "verified" } as const;
      expect(await second.remember(url, rotated)).toBe("verified");
      expect((await first.read(url)).map(m => m.status)).toEqual(["deleted", "deleted", "verified"]);
    });

    test("does not apply a cached verification to a changed message with the same ID", async () => {
      const cache = new VerificationState();
      await cache.remember(url, { ...entry, status: "verified" });
      const forged = structuredClone(entry);
      forged.digest = "different-body";
      await expect(cache.remember(url, forged)).rejects.toThrow("Inbox changed an existing announcement");
      expect(await cache.read(url)).toEqual([{ ...entry, status: "verified" }]);
    });

    test("does not lose deletion during a concurrent verification update", async () => {
      const first = new VerificationState();
      const second = storage === "memory" ? first : new VerificationState();
      await first.remember(url, { ...entry, status: "verified" });
      await Promise.all([
        first.deleted(url, entry.storageKey),
        second.remember(url, { ...entry, scope: "another reader", status: "verified" }),
      ]);
      expect((await first.read(url)).map(message => message.status)).toEqual(["deleted", "deleted"]);
    });
  });
}
