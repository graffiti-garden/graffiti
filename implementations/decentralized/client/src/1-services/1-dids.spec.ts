import { describe, expect, test } from "vitest";
import { DecentralizedIdentifiers } from "./1-dids";

describe("DecentralizedIdentifiers", () => {
  const dids = new DecentralizedIdentifiers();

  test("invalid method", async () => {
    await expect(dids.resolve("did:invalid:12345")).rejects.toThrowError();
  });

  test("did:web", async () => {
    const did = "did:web:theia.graffiti.actor";
    const result = await dids.resolve(did);
    expect(result).toHaveProperty("id", did);
  });

  test("did:plc", async () => {
    const did = "did:plc:numtqzbw74lmrguyvpzq6uf5";
    const result = await dids.resolve(did);
    expect(result).toHaveProperty("id", did);
  });
});
