import { describe, expect, test } from "vitest";
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
  });
}
