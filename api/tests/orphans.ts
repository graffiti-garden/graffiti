import { it, expect, describe, assert, beforeAll } from "vitest";
import type { Graffiti, GraffitiSession } from "@graffiti-garden/api";
import { randomPutObject, randomString, nextStreamValue } from "./utils";

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
        existingOrphans.push(orphan.value.url);
      }

      const object = randomPutObject();
      object.channels = [];
      const putted = await graffiti.put<{}>(object, session);
      const orphanIterator2 = graffiti.recoverOrphans({}, session);
      let numResults = 0;
      for await (const orphan of orphanIterator2) {
        if (orphan.error) continue;
        assert(!orphan.tombstone, "orphan is tombstone");
        if (orphan.value.url === putted.url) {
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

      expect(Object.keys(object.value).length).toBeGreaterThanOrEqual(1);
      expect(Object.keys(object.value)[0]).toBeTypeOf("string");
      const iterator1 = graffiti.recoverOrphans(
        {
          properties: {
            value: {
              properties: {
                [Object.keys(object.value)[0]]: {
                  type: "string",
                },
              },
              required: [Object.keys(object.value)[0]],
            },
          },
        },
        session,
      );
      const value1 = await nextStreamValue(iterator1);
      expect(value1.value).toEqual(object.value);
      const returnValue = await iterator1.next();
      assert(returnValue.done, "value2 is not done");

      const putNotOrphan = await graffiti.put<{}>(
        {
          ...putOrphan,
          ...object,
          channels: [randomString()],
        },
        session,
      );
      expect(putNotOrphan.url).toBe(putOrphan.url);
      expect(putNotOrphan.lastModified).toBeGreaterThan(putOrphan.lastModified);

      // The tombstone will not appear to a fresh iterator
      const orphanIterator = graffiti.recoverOrphans({}, session);
      let numResults = 0;
      for await (const orphan of orphanIterator) {
        if (orphan.error) continue;
        if (orphan.value.url === putOrphan.url) {
          numResults++;
        }
      }
      expect(numResults).toBe(0);

      const iterator2 = returnValue.value.continue();
      const value2 = await iterator2.next();
      assert(
        !value2.done && !value2.value.error,
        "value2 is done or has error",
      );
      expect(value2.value.tombstone).toBe(true);
      expect(value2.value.value.lastModified).toBe(putNotOrphan.lastModified);
      expect(value2.value.value.channels).toEqual([]);
      await expect(iterator2.next()).resolves.toHaveProperty("done", true);
    });
  });
};
