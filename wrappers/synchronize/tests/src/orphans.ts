import { it, expect, describe, assert } from "vitest";
import type { GraffitiFactory, GraffitiSession } from "@graffiti-garden/api";
import { randomPutObject, randomString } from "./utils";

export const graffitiOrphanTests = (
  useGraffiti: GraffitiFactory,
  useSession1: () => GraffitiSession,
  useSession2: () => GraffitiSession,
) => {
  describe("recoverOrphans", () => {
    it("list orphans", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();

      const existingOrphans: string[] = [];
      const orphanIterator1 = graffiti.recoverOrphans({}, session);
      for await (const orphan of orphanIterator1) {
        if (orphan.error) continue;
        existingOrphans.push(orphan.value.name);
      }

      const object = randomPutObject();
      object.channels = [];
      const putted = await graffiti.put(object, session);
      const orphanIterator2 = graffiti.recoverOrphans({}, session);
      let numResults = 0;
      for await (const orphan of orphanIterator2) {
        if (orphan.error) continue;
        if (orphan.value.name === putted.name) {
          numResults++;
          expect(orphan.value.source).toBe(putted.source);
          expect(orphan.value.lastModified).toBe(putted.lastModified);
        }
      }
      expect(numResults).toBe(1);
    });

    it("replaced orphan, no longer", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();

      const object = randomPutObject();
      object.channels = [];
      const putOrphan = await graffiti.put(object, session);

      const putNotOrphan = await graffiti.put(
        {
          ...putOrphan,
          ...object,
          channels: [randomString()],
        },
        session,
      );
      expect(putNotOrphan.name).toBe(putOrphan.name);

      const orphanIterator = graffiti.recoverOrphans({}, session);
      let numResults = 0;
      for await (const orphan of orphanIterator) {
        if (orphan.error) continue;
        if (orphan.value.name === putOrphan.name) {
          numResults++;
          expect(orphan.value.tombstone).toBe(true);
          expect(orphan.value.lastModified).toBe(putNotOrphan.lastModified);
          expect(orphan.value.channels).toEqual([]);
        }
      }
      expect(numResults).toBe(1);
    });
  });
};
