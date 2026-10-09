import { describe, expect, test } from "vitest";
import { Handles } from "./2-handles";
import { DecentralizedIdentifiers } from "../1-services/2-dids";

export function handleTests(handle: string) {
  describe("Handles", async () => {
    const handles = new Handles({
      dids: new DecentralizedIdentifiers(),
    });

    test("handleToActor and actorToHandle", async () => {
      const actor = await handles.handleToActor(handle);
      const resolvedHandle = await handles.actorToHandle(actor);
      expect(resolvedHandle).toBe(handle);
    });

    test("actorToHandle uses the first did:web alias", async () => {
      const actor = "did:plc:example";
      const handleDid = "did:web:alice.example";
      const dids = {
        resolve: async (did: string) => did === actor
          ? { alsoKnownAs: ["at://alice.example", handleDid, "did:web:other.example"] }
          : { alsoKnownAs: [actor] },
      } as DecentralizedIdentifiers;
      expect(await new Handles({ dids }).actorToHandle(actor)).toBe("alice.example");
    });

  });
}
