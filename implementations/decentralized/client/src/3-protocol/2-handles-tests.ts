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
  });
}
