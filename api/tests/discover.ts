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
      const iterator = graffiti.discover<{}>(queryChannels, {});
      const value = await nextStreamValue<{}>(iterator);
      expect(value.value).toEqual(object.value);
      expect(value.channels).toEqual([object.channels[0]]);
      expect(value.allowed).toBeUndefined();
      expect(value.actor).toEqual(session.actor);
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

      const iteratorSession1 = graffiti.discover<{}>(
        object.channels,
        {},
        session1,
      );
      const value = await nextStreamValue<{}>(iteratorSession1);
      expect(value.value).toEqual(object.value);
      expect(value.channels).toEqual(object.channels);
      expect(value.allowed).toEqual(object.allowed);
      expect(value.actor).toEqual(session1.actor);
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

      const iteratorSession2 = graffiti.discover<{}>(
        object.channels,
        {},
        session2,
      );
      const value = await nextStreamValue<{}>(iteratorSession2);
      expect(value.value).toEqual(object.value);
      expect(value.allowed).toEqual([session2.actor]);
      expect(value.channels).toEqual(object.channels);
      expect(value.actor).toEqual(session1.actor);
      expect(value.lastModified).toEqual(putted.lastModified);
    });

    for (const prop of ["actor", "lastModified"] as const) {
      it(`discover for ${prop}`, async () => {
        const object1 = randomPutObject();
        const putted1 = await graffiti.put<{}>(object1, session1);

        const object2 = randomPutObject();
        object2.channels = object1.channels;
        // Make sure the lastModified is different for the query
        await new Promise((r) => setTimeout(r, 20));
        const putted2 = await graffiti.put<{}>(object2, session2);

        const iterator = graffiti.discover<{}>(object1.channels, {
          properties: {
            [prop]: {
              enum: [putted1[prop]],
            },
          },
        });

        const value = await nextStreamValue<{}>(iterator);
        expect(value.url).toEqual(putted1.url);
        expect(value.url).not.toEqual(putted2.url);
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

      expect(putted1.url).not.toEqual(putted2.url);
      expect(putted1.lastModified).toBeLessThan(putted2.lastModified);

      const gtIterator = graffiti.discover([object.channels[0]], {
        properties: {
          lastModified: {
            exclusiveMinimum: putted2.lastModified,
          },
        },
      });
      expect(await gtIterator.next()).toHaveProperty("done", true);
      const gtIteratorEpsilon = graffiti.discover<{}>([object.channels[0]], {
        properties: {
          lastModified: {
            exclusiveMinimum: putted2.lastModified - 0.1,
          },
        },
      });
      const value1 = await nextStreamValue<{}>(gtIteratorEpsilon);
      expect(value1.url).toEqual(putted2.url);
      expect(await gtIteratorEpsilon.next()).toHaveProperty("done", true);
      const gteIterator = graffiti.discover<{}>(object.channels, {
        properties: {
          value: {},
          lastModified: {
            minimum: putted2.lastModified,
          },
        },
      });
      const value = await nextStreamValue<{}>(gteIterator);
      expect(value.url).toEqual(putted2.url);
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

      const ltIteratorEpsilon = graffiti.discover<{}>(object.channels, {
        properties: {
          lastModified: {
            exclusiveMaximum: putted1.lastModified + 0.1,
          },
        },
      });
      const value3 = await nextStreamValue<{}>(ltIteratorEpsilon);
      expect(value3.url).toEqual(putted1.url);
      expect(await ltIteratorEpsilon.next()).toHaveProperty("done", true);

      const lteIterator = graffiti.discover<{}>(object.channels, {
        properties: {
          lastModified: {
            maximum: putted1.lastModified,
          },
        },
      });
      const value2 = await nextStreamValue<{}>(lteIterator);
      expect(value2.url).toEqual(putted1.url);
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

      const iteratorSession1 = graffiti.discover<{}>(
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
      const value = await nextStreamValue<{}>(iteratorSession1);
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
      const iteratorSession2SmallAllowPeekSelf = graffiti.discover<{}>(
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
      const value2 = await nextStreamValue<{}>(
        iteratorSession2SmallAllowPeekSelf,
      );
      expect(value2.value).toEqual(object.value);
      await expect(
        iteratorSession2SmallAllowPeekSelf.next(),
      ).resolves.toHaveProperty("done", true);
    });

    it("discover schema channels, as and not as owner", async () => {
      const object = randomPutObject();
      object.channels = [randomString(), randomString(), randomString()];
      await graffiti.put<{}>(object, session1);

      const iteratorSession1 = graffiti.discover<{}>(
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
      const value = await nextStreamValue<{}>(iteratorSession1);
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
      const iteratorSession2SmallAllowPeekSelf = graffiti.discover<{}>(
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
      const value2 = await nextStreamValue<{}>(
        iteratorSession2SmallAllowPeekSelf,
      );
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
      const iterator = graffiti.discover<{}>(
        publicO.channels,
        publicSchema,
        session1,
      );
      const value = await nextStreamValue<{}>(iterator);
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
          if (property in result.object.value) {
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

      const iterator1 = graffiti.discover<{}>(object.channels, {});
      const value1 = await nextStreamValue<{}>(iterator1);
      expect(value1.value).toEqual(object.value);
      const returnValue = await iterator1.next();
      assert(returnValue.done, "value2 is not done");

      const deleted = await graffiti.delete(putted, session);

      const iterator = graffiti.discover(object.channels, {});
      await expect(iterator.next()).resolves.toHaveProperty("done", true);

      const tombIterator = returnValue.value.continue();
      const value = await tombIterator.next();
      assert(!value.done && !value.value.error, "value is done");
      assert(value.value.tombstone, "value is not tombstone");
      expect(value.value.url).toEqual(putted.url);
      await expect(tombIterator.next()).resolves.toHaveProperty("done", true);
    });

    it("discover for replaced channels", async () => {
      // Do this a bunch to check for concurrency issues
      for (let i = 0; i < 20; i++) {
        const object1 = randomPutObject();
        const putted = await graffiti.put<{}>(object1, session);

        const iterator3 = graffiti.discover<{}>(object1.channels, {});
        const value3 = await nextStreamValue<{}>(iterator3);
        expect(value3.value).toEqual(object1.value);
        const returnValue = await iterator3.next();
        assert(returnValue.done, "value2 is not done");

        const object2 = randomPutObject();
        const replaced = await graffiti.put<{}>(
          {
            ...object2,
            url: putted.url,
          },
          session,
        );

        const iterator1 = graffiti.discover(object1.channels, {});
        const iterator2 = graffiti.discover<{}>(object2.channels, {});
        const tombIterator = returnValue.value.continue();

        if (putted.lastModified === replaced.lastModified) {
          const value1 = await iterator1.next();
          const value2 = await iterator2.next();
          const value3 = await tombIterator.next();

          // Only one should be done
          expect(value1.done || value2.done).toBe(true);
          expect(value1.done && value2.done).toBe(false);

          assert(!value3.done && !value3.value.error, "value is done");
          expect(value3.value.tombstone || value2.done).toBe(true);
          expect(value3.value.tombstone && value2.done).toBe(false);
          continue;
        }

        // Otherwise 1 should be done and 2 should not
        await expect(iterator1.next()).resolves.toHaveProperty("done", true);

        const value4 = await tombIterator.next();
        assert(!value4.done && !value4.value.error, "value is done");

        assert(value4.value.tombstone, "value is not tombstone");
        expect(value4.value.url).toEqual(putted.url);

        const value2 = await nextStreamValue<{}>(iterator2);
        await expect(iterator2.next()).resolves.toHaveProperty("done", true);

        expect(value2.value).toEqual(object2.value);
        expect(value2.channels).toEqual(object2.channels);
        expect(value2.lastModified).toEqual(replaced.lastModified);
      }
    });

    it("discover for patched allowed", async () => {
      const object = randomPutObject();
      const putted = await graffiti.put<{}>(object, session);

      const iterator1 = graffiti.discover<{}>(object.channels, {});
      const value1 = await nextStreamValue<{}>(iterator1);
      expect(value1.value).toEqual(object.value);
      const returnValue = await iterator1.next();
      assert(returnValue.done, "value2 is not done");

      await graffiti.patch(
        {
          allowed: [{ op: "add", path: "", value: [] }],
        },
        putted,
        session,
      );
      const iterator2 = graffiti.discover(object.channels, {});
      expect(await iterator2.next()).toHaveProperty("done", true);

      const iterator = returnValue.value.continue();
      const value = await iterator.next();
      assert(!value.done && !value.value.error, "value is done");
      assert(value.value.tombstone, "value is not tombstone");
      expect(value.value.url).toEqual(putted.url);
      await expect(iterator.next()).resolves.toHaveProperty("done", true);
    });

    it("put concurrently and discover one", async () => {
      const object = randomPutObject();

      // Put a first one to get a URI
      const putted = await graffiti.put<{}>(object, session);

      const putPromises = Array(99)
        .fill(0)
        .map(() =>
          graffiti.put<{}>(
            {
              ...object,
              url: putted.url,
            },
            session,
          ),
        );
      await Promise.all(putPromises);

      const iterator = graffiti.discover(object.channels, {});
      let tombstoneCount = 0;
      let valueCount = 0;
      for await (const result of iterator) {
        assert(!result.error, "result has error");
        if (result.tombstone) {
          tombstoneCount++;
        } else {
          valueCount++;
        }
      }
      expect(tombstoneCount).toBe(0);
      expect(valueCount).toBe(1);
    });
  });
};
