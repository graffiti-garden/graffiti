import { it, expect, describe, assert, beforeAll } from "vitest";
import type { Graffiti, GraffitiSession } from "@graffiti-garden/api";
import { randomPutObject, randomString } from "./utils";

export const graffitiOrphanTests = (
  useGraffiti: () => Pick<
    Graffiti,
    "recoverOrphans" | "put" | "delete" | "patch"
  >,
  useSession1: () => GraffitiSession | Promise<GraffitiSession>,
  useSession2: () => GraffitiSession | Promise<GraffitiSession>,
) => {
  describe("recoverOrphans", { timeout: 20000 }, () => {
    let graffiti: ReturnType<typeof useGraffiti>;
    let session: GraffitiSession;
    let session1: GraffitiSession;
    let session2: GraffitiSession;
    beforeAll(async () => {
      graffiti = useGraffiti();
      session1 = await useSession1();
      session = session1;
      session2 = await useSession2();
    });

    it("list orphans", async () => {
      const existingOrphans: string[] = [];
      const orphanIterator1 = graffiti.recoverOrphans({}, session);
      for await (const orphan of orphanIterator1) {
        if (orphan.error) continue;
        existingOrphans.push(orphan.value.uri);
      }

      const object = randomPutObject();
      object.channels = [];
      const putted = await graffiti.put<{}>(object, session);
      const orphanIterator2 = graffiti.recoverOrphans({}, session);
      let numResults = 0;
      for await (const orphan of orphanIterator2) {
        if (orphan.error) continue;
        if (orphan.value.uri === putted.uri) {
          numResults++;
          expect(orphan.value.lastModified).toBe(putted.lastModified);
        }
      }
      expect(numResults).toBe(1);
    });

    it("replaced orphan, no longer", async () => {
      const object = randomPutObject();
      object.channels = [];
      const putOrphan = await graffiti.put<{}>(object, session);

      // Wait for the put to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      const putNotOrphan = await graffiti.put<{}>(
        {
          ...putOrphan,
          ...object,
          channels: [randomString()],
        },
        session,
      );
      expect(putNotOrphan.uri).toBe(putOrphan.uri);
      expect(putNotOrphan.lastModified).toBeGreaterThan(putOrphan.lastModified);

      const orphanIterator = graffiti.recoverOrphans({}, session);
      let numResults = 0;
      for await (const orphan of orphanIterator) {
        if (orphan.error) continue;
        if (orphan.value.uri === putOrphan.uri) {
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
