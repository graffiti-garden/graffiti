import { it, expect, describe, assert, beforeAll } from "vitest";
import type {
  Graffiti,
  GraffitiSession,
  JSONSchema,
} from "@graffiti-garden/api";
import { randomString, nextStreamValue, randomPutObject } from "./utils";

export const graffitiDiscoverTests = (
  useGraffiti: () => Pick<Graffiti, "discover" | "put" | "delete" | "patch">,
  useSession1: () => GraffitiSession | Promise<GraffitiSession>,
  useSession2: () => GraffitiSession | Promise<GraffitiSession>,
) => {
  describe.concurrent("discover", { timeout: 20000 }, () => {
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

    it("discover nothing", async () => {
      const iterator = graffiti.discover([], {});
      expect(await iterator.next()).toHaveProperty("done", true);
    });

    it("discover single", async () => {
      const object = randomPutObject();

      const putted = await graffiti.put<{}>(object, session);

      const queryChannels = [randomString(), object.channels[0]];
      const iterator = graffiti.discover(queryChannels, {});
      const value = await nextStreamValue(iterator);
      expect(value.value).toEqual(object.value);
      expect(value.channels).toEqual([object.channels[0]]);
      expect(value.allowed).toBeUndefined();
      expect(value.actor).toEqual(session.actor);
      expect(value.tombstone).toBe(false);
      expect(value.lastModified).toEqual(putted.lastModified);
      const result2 = await iterator.next();
      expect(result2.done).toBe(true);
    });

    it("discover wrong channel", async () => {
      const object = randomPutObject();
      await graffiti.put<{}>(object, session);
      const iterator = graffiti.discover([randomString()], {});
      await expect(iterator.next()).resolves.toHaveProperty("done", true);
    });

    it("discover not allowed", async () => {
      const object = randomPutObject();
      object.allowed = [randomString(), randomString()];
      const putted = await graffiti.put<{}>(object, session1);

      const iteratorSession1 = graffiti.discover(object.channels, {}, session1);
      const value = await nextStreamValue(iteratorSession1);
      expect(value.value).toEqual(object.value);
      expect(value.channels).toEqual(object.channels);
      expect(value.allowed).toEqual(object.allowed);
      expect(value.actor).toEqual(session1.actor);
      expect(value.tombstone).toBe(false);
      expect(value.lastModified).toEqual(putted.lastModified);

      const iteratorSession2 = graffiti.discover(object.channels, {}, session2);
      expect(await iteratorSession2.next()).toHaveProperty("done", true);

      const iteratorNoSession = graffiti.discover(object.channels, {});
      expect(await iteratorNoSession.next()).toHaveProperty("done", true);
    });

    it("discover allowed", async () => {
      const object = randomPutObject();
      object.allowed = [randomString(), session2.actor, randomString()];
      const putted = await graffiti.put<{}>(object, session1);

      const iteratorSession2 = graffiti.discover(object.channels, {}, session2);
      const value = await nextStreamValue(iteratorSession2);
      expect(value.value).toEqual(object.value);
      expect(value.allowed).toEqual([session2.actor]);
      expect(value.channels).toEqual(object.channels);
      expect(value.actor).toEqual(session1.actor);
      expect(value.tombstone).toBe(false);
      expect(value.lastModified).toEqual(putted.lastModified);
    });

    for (const prop of ["name", "actor", "lastModified"] as const) {
      it(`discover for ${prop}`, async () => {
        const object1 = randomPutObject();
        const putted1 = await graffiti.put<{}>(object1, session1);

        const object2 = randomPutObject();
        object2.channels = object1.channels;
        // Make sure the lastModified is different for the query
        await new Promise((r) => setTimeout(r, 20));
        const putted2 = await graffiti.put<{}>(object2, session2);

        const iterator = graffiti.discover(object1.channels, {
          properties: {
            [prop]: {
              enum: [putted1[prop]],
            },
          },
        });

        const value = await nextStreamValue(iterator);
        expect(value.name).toEqual(putted1.name);
        expect(value.name).not.toEqual(putted2.name);
        expect(value.value).toEqual(object1.value);
        await expect(iterator.next()).resolves.toHaveProperty("done", true);
      });
    }

    it("discover with lastModified range", async () => {
      const object = randomPutObject();
      const putted1 = await graffiti.put<{}>(object, session);
      // Make sure the lastModified is different
      await new Promise((r) => setTimeout(r, 20));
      const putted2 = await graffiti.put<{}>(object, session);

      expect(putted1.name).not.toEqual(putted2.name);
      expect(putted1.lastModified).toBeLessThan(putted2.lastModified);

      const gtIterator = graffiti.discover([object.channels[0]], {
        properties: {
          lastModified: {
            exclusiveMinimum: putted2.lastModified,
          },
        },
      });
      expect(await gtIterator.next()).toHaveProperty("done", true);
      const gtIteratorEpsilon = graffiti.discover([object.channels[0]], {
        properties: {
          lastModified: {
            exclusiveMinimum: putted2.lastModified - 0.1,
          },
        },
      });
      const value1 = await nextStreamValue(gtIteratorEpsilon);
      expect(value1.name).toEqual(putted2.name);
      expect(await gtIteratorEpsilon.next()).toHaveProperty("done", true);
      const gteIterator = graffiti.discover(object.channels, {
        properties: {
          value: {},
          lastModified: {
            minimum: putted2.lastModified,
          },
        },
      });
      const value = await nextStreamValue(gteIterator);
      expect(value.name).toEqual(putted2.name);
      expect(await gteIterator.next()).toHaveProperty("done", true);
      const gteIteratorEpsilon = graffiti.discover(object.channels, {
        properties: {
          lastModified: {
            minimum: putted2.lastModified + 0.1,
          },
        },
      });
      expect(await gteIteratorEpsilon.next()).toHaveProperty("done", true);

      const ltIterator = graffiti.discover(object.channels, {
        properties: {
          lastModified: {
            exclusiveMaximum: putted1.lastModified,
          },
        },
      });
      expect(await ltIterator.next()).toHaveProperty("done", true);

      const ltIteratorEpsilon = graffiti.discover(object.channels, {
        properties: {
          lastModified: {
            exclusiveMaximum: putted1.lastModified + 0.1,
          },
        },
      });
      const value3 = await nextStreamValue(ltIteratorEpsilon);
      expect(value3.name).toEqual(putted1.name);
      expect(await ltIteratorEpsilon.next()).toHaveProperty("done", true);

      const lteIterator = graffiti.discover(object.channels, {
        properties: {
          lastModified: {
            maximum: putted1.lastModified,
          },
        },
      });
      const value2 = await nextStreamValue(lteIterator);
      expect(value2.name).toEqual(putted1.name);
      expect(await lteIterator.next()).toHaveProperty("done", true);

      const lteIteratorEpsilon = graffiti.discover(object.channels, {
        properties: {
          lastModified: {
            maximum: putted1.lastModified - 0.1,
          },
        },
      });
      expect(await lteIteratorEpsilon.next()).toHaveProperty("done", true);
    });

    it("discover schema allowed, as and not as owner", async () => {
      const object = randomPutObject();
      object.allowed = [randomString(), session2.actor, randomString()];
      await graffiti.put<{}>(object, session1);

      const iteratorSession1 = graffiti.discover(
        object.channels,
        {
          properties: {
            allowed: {
              minItems: 3,
              // Make sure session2.actor is in the allow list
              not: {
                items: {
                  not: {
                    enum: [session2.actor],
                  },
                },
              },
            },
          },
        },
        session1,
      );
      const value = await nextStreamValue(iteratorSession1);
      expect(value.value).toEqual(object.value);
      await expect(iteratorSession1.next()).resolves.toHaveProperty(
        "done",
        true,
      );

      const iteratorSession2BigAllow = graffiti.discover(
        object.channels,
        {
          properties: {
            allowed: {
              minItems: 3,
            },
          },
        },
        session2,
      );
      await expect(iteratorSession2BigAllow.next()).resolves.toHaveProperty(
        "done",
        true,
      );
      const iteratorSession2PeekOther = graffiti.discover(
        object.channels,
        {
          properties: {
            allowed: {
              not: {
                items: {
                  not: {
                    enum: [object.channels[0]],
                  },
                },
              },
            },
          },
        },
        session2,
      );
      await expect(iteratorSession2PeekOther.next()).resolves.toHaveProperty(
        "done",
        true,
      );
      const iteratorSession2SmallAllowPeekSelf = graffiti.discover(
        object.channels,
        {
          properties: {
            allowed: {
              maxItems: 1,
              not: {
                items: {
                  not: {
                    enum: [session2.actor],
                  },
                },
              },
            },
          },
        },
        session2,
      );
      const value2 = await nextStreamValue(iteratorSession2SmallAllowPeekSelf);
      expect(value2.value).toEqual(object.value);
      await expect(
        iteratorSession2SmallAllowPeekSelf.next(),
      ).resolves.toHaveProperty("done", true);
    });

    it("discover schema channels, as and not as owner", async () => {
      const object = randomPutObject();
      object.channels = [randomString(), randomString(), randomString()];
      await graffiti.put<{}>(object, session1);

      const iteratorSession1 = graffiti.discover(
        [object.channels[0], object.channels[2]],
        {
          properties: {
            channels: {
              minItems: 3,
              // Make sure session2.actor is in the allow list
              not: {
                items: {
                  not: {
                    enum: [object.channels[1]],
                  },
                },
              },
            },
          },
        },
        session1,
      );
      const value = await nextStreamValue(iteratorSession1);
      expect(value.value).toEqual(object.value);
      await expect(iteratorSession1.next()).resolves.toHaveProperty(
        "done",
        true,
      );

      const iteratorSession2BigAllow = graffiti.discover(
        [object.channels[0], object.channels[2]],
        {
          properties: {
            channels: {
              minItems: 3,
            },
          },
        },
        session2,
      );
      await expect(iteratorSession2BigAllow.next()).resolves.toHaveProperty(
        "done",
        true,
      );
      const iteratorSession2PeekOther = graffiti.discover(
        [object.channels[0], object.channels[2]],
        {
          properties: {
            channels: {
              not: {
                items: {
                  not: {
                    enum: [object.channels[1]],
                  },
                },
              },
            },
          },
        },
        session2,
      );
      await expect(iteratorSession2PeekOther.next()).resolves.toHaveProperty(
        "done",
        true,
      );
      const iteratorSession2SmallAllowPeekSelf = graffiti.discover(
        [object.channels[0], object.channels[2]],
        {
          properties: {
            allowed: {
              maxItems: 2,
              not: {
                items: {
                  not: {
                    enum: [object.channels[2]],
                  },
                },
              },
            },
          },
        },
        session2,
      );
      const value2 = await nextStreamValue(iteratorSession2SmallAllowPeekSelf);
      expect(value2.value).toEqual(object.value);
      await expect(
        iteratorSession2SmallAllowPeekSelf.next(),
      ).resolves.toHaveProperty("done", true);
    });

    it("discover query for empty allowed", async () => {
      const publicO = randomPutObject();

      const publicSchema = {
        not: {
          required: ["allowed"],
        },
      } satisfies JSONSchema;

      await graffiti.put<{}>(publicO, session1);
      const iterator = graffiti.discover(
        publicO.channels,
        publicSchema,
        session1,
      );
      const value = await nextStreamValue(iterator);
      expect(value.value).toEqual(publicO.value);
      expect(value.allowed).toBeUndefined();
      await expect(iterator.next()).resolves.toHaveProperty("done", true);

      const restricted = randomPutObject();
      restricted.allowed = [];
      await graffiti.put<{}>(restricted, session1);
      const iterator2 = graffiti.discover(
        restricted.channels,
        publicSchema,
        session1,
      );
      await expect(iterator2.next()).resolves.toHaveProperty("done", true);
    });

    it("discover query for values", async () => {
      const object1 = randomPutObject();
      object1.value = { test: randomString() };
      await graffiti.put<{}>(object1, session);

      const object2 = randomPutObject();
      object2.channels = object1.channels;
      object2.value = { test: randomString(), something: randomString() };
      await graffiti.put<{}>(object2, session);

      const object3 = randomPutObject();
      object3.channels = object1.channels;
      object3.value = { other: randomString(), something: randomString() };
      await graffiti.put<{}>(object3, session);

      const counts = new Map<string, number>();
      for (const property of ["test", "something", "other"] as const) {
        let count = 0;
        for await (const result of graffiti.discover(object1.channels, {
          properties: {
            value: {
              required: [property],
            },
          },
        })) {
          assert(!result.error, "result has error");
          if (property in result.value.value) {
            count++;
          }
        }
        counts.set(property, count);
      }

      expect(counts.get("test")).toBe(2);
      expect(counts.get("something")).toBe(2);
      expect(counts.get("other")).toBe(1);
    });

    it("discover for deleted content", async () => {
      const object = randomPutObject();
      const putted = await graffiti.put<{}>(object, session);
      const deleted = await graffiti.delete(putted, session);

      const iterator = graffiti.discover(object.channels, {});
      const value = await nextStreamValue(iterator);
      expect(value.tombstone).toBe(true);
      expect(value.value).toEqual(object.value);
      expect(value.channels).toEqual(object.channels);
      expect(value.actor).toEqual(session.actor);
      expect(value.lastModified).toEqual(deleted.lastModified);
      await expect(iterator.next()).resolves.toHaveProperty("done", true);
    });

    it("discover for replaced channels", async () => {
      // Do this a bunch to check for concurrency issues
      for (let i = 0; i < 10; i++) {
        const object1 = randomPutObject();
        const putted = await graffiti.put<{}>(object1, session);
        const object2 = randomPutObject();
        const replaced = await graffiti.put<{}>(
          {
            ...putted,
            ...object2,
          },
          session,
        );

        const iterator1 = graffiti.discover(object1.channels, {});
        const value1 = await nextStreamValue(iterator1);
        await expect(iterator1.next()).resolves.toHaveProperty("done", true);

        const iterator2 = graffiti.discover(object2.channels, {});
        const value2 = await nextStreamValue(iterator2);
        await expect(iterator2.next()).resolves.toHaveProperty("done", true);

        // If they have the same timestamp, except
        // only one to have a tombstone
        if (putted.lastModified === replaced.lastModified) {
          expect(value1.tombstone || value2.tombstone).toBe(true);
          expect(value1.tombstone && value2.tombstone).toBe(false);
        } else {
          expect(value1.tombstone).toBe(true);
          expect(value1.value).toEqual(object1.value);
          expect(value1.channels).toEqual(object1.channels);
          expect(value1.lastModified).toEqual(replaced.lastModified);

          expect(value2.tombstone).toBe(false);
          expect(value2.value).toEqual(object2.value);
          expect(value2.channels).toEqual(object2.channels);
          expect(value2.lastModified).toEqual(replaced.lastModified);
        }
      }
    });

    it("discover for patched allowed", async () => {
      const object = randomPutObject();
      const putted = await graffiti.put<{}>(object, session);
      await graffiti.patch(
        {
          allowed: [{ op: "add", path: "", value: [] }],
        },
        putted,
        session,
      );
      const iterator = graffiti.discover(object.channels, {});
      const value = await nextStreamValue(iterator);
      expect(value.tombstone).toBe(true);
      expect(value.value).toEqual(object.value);
      expect(value.channels).toEqual(object.channels);
      expect(value.allowed).toBeUndefined();
      await expect(iterator.next()).resolves.toHaveProperty("done", true);
    });

    it("put concurrently and discover one", async () => {
      const object = randomPutObject();
      object.name = randomString();

      const putPromises = Array(100)
        .fill(0)
        .map(() => graffiti.put<{}>(object, session));
      await Promise.all(putPromises);

      const iterator = graffiti.discover(object.channels, {});
      let tombstoneCount = 0;
      let valueCount = 0;
      for await (const result of iterator) {
        assert(!result.error, "result has error");
        if (result.value.tombstone) {
          tombstoneCount++;
        } else {
          valueCount++;
        }
      }
      expect(tombstoneCount).toBe(99);
      expect(valueCount).toBe(1);
    });
  });
};
