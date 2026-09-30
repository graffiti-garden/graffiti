import type { DIDResolutionResult, Resolver } from "did-resolver";
import { describe, expect, test, vi } from "vitest";
import { DecentralizedIdentifiers } from "./2-dids";

export function didTests() {
  return describe("DecentralizedIdentifiers", () => {
    const dids = new DecentralizedIdentifiers();

    test("invalid method", async () => {
      await expect(dids.resolve("did:invalid:12345")).rejects.toThrowError();
    });

    test("did:web", async () => {
      const did = "did:web:identity.foundation";
      const result = await dids.resolve(did);
      expect(result).toHaveProperty("id", did);
    });

    test("did:plc", async () => {
      const did = "did:plc:44ybard66vv44zksje25o7dz";
      const result = await dids.resolve(did);
      expect(result).toHaveProperty("id", did);
    });

    test("coalesces simultaneous resolutions", async () => {
      const dids = new DecentralizedIdentifiers();
      const did = "did:web:example.com";
      const found: DIDResolutionResult = {
        didDocument: { id: did },
        didDocumentMetadata: {},
        didResolutionMetadata: {},
      };
      let finish!: (result: DIDResolutionResult) => void;
      const lookup = vi.fn<Resolver["resolve"]>().mockImplementation(
        () => new Promise((resolve) => { finish = resolve; }),
      );
      Object.defineProperty(dids, "resolver", { value: { resolve: lookup } });

      const first = dids.resolve(did);
      const second = dids.resolve(did);
      expect(lookup).toHaveBeenCalledTimes(1);

      finish(found);
      await expect(Promise.all([first, second])).resolves.toEqual([
        found.didDocument,
        found.didDocument,
      ]);

      lookup.mockResolvedValue(found);
      await expect(dids.resolve(did)).resolves.toEqual(found.didDocument);
      expect(lookup).toHaveBeenCalledTimes(2);
    });

    test("retries a failed resolution", async () => {
      const dids = new DecentralizedIdentifiers();
      const did = "did:web:example.com";
      const found: DIDResolutionResult = {
        didDocument: { id: did },
        didDocumentMetadata: {},
        didResolutionMetadata: {},
      };
      const lookup = vi.fn<Resolver["resolve"]>()
        .mockResolvedValueOnce({
          didDocument: null,
          didDocumentMetadata: {},
          didResolutionMetadata: { error: "notFound" },
        })
        .mockResolvedValueOnce(found);
      Object.defineProperty(dids, "resolver", { value: { resolve: lookup } });

      const failed = await Promise.allSettled([
        dids.resolve(did),
        dids.resolve(did),
      ]);
      expect(lookup).toHaveBeenCalledTimes(1);
      expect(failed.map((result) => result.status)).toEqual([
        "rejected",
        "rejected",
      ]);

      await expect(dids.resolve(did)).resolves.toEqual(found.didDocument);
      expect(lookup).toHaveBeenCalledTimes(2);
    });
  });
}
