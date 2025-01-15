import { it, expect, describe, assert } from "vitest";
import {
  type GraffitiFactory,
  type GraffitiSession,
  type JSONSchema4,
} from "../src/index";
import { randomString, randomValue, randomPutObject } from "./utils";

export const graffitiDiscoverTests = (
  useGraffiti: GraffitiFactory,
  useSession1: () => GraffitiSession,
  useSession2: () => GraffitiSession,
) => {
  describe("discover", () => {
    it("discover nothing", async () => {
      const graffiti = useGraffiti();
      const iterator = graffiti.discover([], {});
      expect(await iterator.next()).toHaveProperty("done", true);
    });

    it("discover single", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();
      const object = randomPutObject();

      const putted = await graffiti.put(object, session);

      const queryChannels = [randomString(), object.channels[0]];
      const iterator = graffiti.discover(queryChannels, {});
      const result = (await iterator.next()).value;
      assert(result && !result.error, "result has no value");
      expect(result.value.value).toEqual(object.value);
      expect(result.value.channels).toEqual([object.channels[0]]);
      expect(result.value.allowed).toBeUndefined();
      expect(result.value.actor).toEqual(session.actor);
      expect(result.value.tombstone).toBe(false);
      expect(result.value.lastModified).toEqual(putted.lastModified);
      const result2 = await iterator.next();
      expect(result2.done).toBe(true);
    });

    it("discover wrong channel", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();
      const object = randomPutObject();
      await graffiti.put(object, session);
      const iterator = graffiti.discover([randomString()], {});
      await expect(iterator.next()).resolves.toHaveProperty("done", true);
    });

    it("discover not allowed", async () => {
      const graffiti = useGraffiti();
      const session1 = useSession1();
      const session2 = useSession2();

      const object = randomPutObject();
      object.allowed = [randomString(), randomString()];
      const putted = await graffiti.put(object, session1);

      const iteratorSession1 = graffiti.discover(object.channels, {}, session1);
      const result = (await iteratorSession1.next()).value;
      assert(result && !result.error, "result has no value");
      expect(result.value.value).toEqual(object.value);
      expect(result.value.channels).toEqual(object.channels);
      expect(result.value.allowed).toEqual(object.allowed);
      expect(result.value.actor).toEqual(session1.actor);
      expect(result.value.tombstone).toBe(false);
      expect(result.value.lastModified).toEqual(putted.lastModified);

      const iteratorSession2 = graffiti.discover(object.channels, {}, session2);
      expect(await iteratorSession2.next()).toHaveProperty("done", true);

      const iteratorNoSession = graffiti.discover(object.channels, {});
      expect(await iteratorNoSession.next()).toHaveProperty("done", true);
    });

    it("discover allowed", async () => {
      const graffiti = useGraffiti();
      const session1 = useSession1();
      const session2 = useSession2();

      const object = randomPutObject();
      object.allowed = [randomString(), session2.actor, randomString()];
      const putted = await graffiti.put(object, session1);

      const iteratorSession2 = graffiti.discover(object.channels, {}, session2);
      const result = (await iteratorSession2.next()).value;
      assert(result && !result.error, "result has no value");
      expect(result.value.value).toEqual(object.value);
      expect(result.value.allowed).toEqual([session2.actor]);
      expect(result.value.channels).toEqual(object.channels);
      expect(result.value.actor).toEqual(session1.actor);
      expect(result.value.tombstone).toBe(false);
      expect(result.value.lastModified).toEqual(putted.lastModified);
    });

    for (const prop of ["name", "actor", "lastModified"] as const) {
      it(`discover for ${prop}`, async () => {
        const graffiti = useGraffiti();
        const session1 = useSession1();
        const session2 = useSession2();

        const object1 = randomPutObject();
        const putted1 = await graffiti.put(object1, session1);

        const object2 = randomPutObject();
        object2.channels = object1.channels;
        // Make sure the lastModified is different for the query
        await new Promise((r) => setTimeout(r, 20));
        const putted2 = await graffiti.put(object2, session2);

        const iterator = graffiti.discover(object1.channels, {
          properties: {
            [prop]: {
              enum: [putted1[prop]],
            },
          },
        });

        const result = (await iterator.next()).value;
        assert(result && !result.error, "result has no value");
        expect(result.value.name).toEqual(putted1.name);
        expect(result.value.name).not.toEqual(putted2.name);
        expect(result.value.value).toEqual(object1.value);
        await expect(iterator.next()).resolves.toHaveProperty("done", true);
      });
    }

    it("discover with lastModified range", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();

      const object = randomPutObject();
      const putted1 = await graffiti.put(object, session);
      // Make sure the lastModified is different
      await new Promise((r) => setTimeout(r, 20));
      const putted2 = await graffiti.put(object, session);

      expect(putted1.name).not.toEqual(putted2.name);
      expect(putted1.lastModified).toBeLessThan(putted2.lastModified);

      const gtIterator = graffiti.discover([object.channels[0]], {
        properties: {
          lastModified: {
            minimum: putted2.lastModified,
            exclusiveMinimum: true,
          },
        },
      });
      expect(await gtIterator.next()).toHaveProperty("done", true);
      const gteIterator = graffiti.discover(object.channels, {
        properties: {
          value: {},
          lastModified: {
            minimum: putted2.lastModified,
          },
        },
      });
      const result = (await gteIterator.next()).value;
      assert(result && !result.error);
      expect(result.value.name).toEqual(putted2.name);
      expect(await gteIterator.next()).toHaveProperty("done", true);

      const ltIterator = graffiti.discover(object.channels, {
        properties: {
          lastModified: {
            maximum: putted1.lastModified,
            exclusiveMaximum: true,
          },
        },
      });
      expect(await ltIterator.next()).toHaveProperty("done", true);

      const lteIterator = graffiti.discover(object.channels, {
        properties: {
          lastModified: {
            maximum: putted1.lastModified,
          },
        },
      });
      const result2 = (await lteIterator.next()).value;
      assert(result2 && !result2.error);
      expect(result2.value.name).toEqual(putted1.name);
      expect(await lteIterator.next()).toHaveProperty("done", true);
    });

    it("discover schema allowed, as and not as owner", async () => {
      const graffiti = useGraffiti();
      const session1 = useSession1();
      const session2 = useSession2();

      const object = randomPutObject();
      object.allowed = [randomString(), session2.actor, randomString()];
      await graffiti.put(object, session1);

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
      const result = (await iteratorSession1.next()).value;
      assert(result && !result.error, "result has no value");
      expect(result.value.value).toEqual(object.value);
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
      const result2 = (await iteratorSession2SmallAllowPeekSelf.next()).value;
      assert(result2 && !result2.error);
      expect(result2.value.value).toEqual(object.value);
      await expect(
        iteratorSession2SmallAllowPeekSelf.next(),
      ).resolves.toHaveProperty("done", true);
    });

    it("discover schema channels, as and not as owner", async () => {
      const graffiti = useGraffiti();
      const session1 = useSession1();
      const session2 = useSession2();

      const object = randomPutObject();
      object.channels = [randomString(), randomString(), randomString()];
      await graffiti.put(object, session1);

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
      const result = (await iteratorSession1.next()).value;
      assert(result && !result.error, "result has no value");
      expect(result.value.value).toEqual(object.value);
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
      const result2 = (await iteratorSession2SmallAllowPeekSelf.next()).value;
      assert(result2 && !result2.error);
      expect(result2.value.value).toEqual(object.value);
      await expect(
        iteratorSession2SmallAllowPeekSelf.next(),
      ).resolves.toHaveProperty("done", true);
    });

    it("discover query for empty allowed", async () => {
      const graffiti = useGraffiti();
      const session1 = useSession1();

      const publicO = randomPutObject();

      const publicSchema = {
        not: {
          required: ["allowed"],
        },
      } satisfies JSONSchema4;

      await graffiti.put(publicO, session1);
      const iterator = graffiti.discover(
        publicO.channels,
        publicSchema,
        session1,
      );
      const result = (await iterator.next()).value;
      assert(result && !result.error, "result has no value");
      expect(result.value.value).toEqual(publicO.value);
      expect(result.value.allowed).toBeUndefined();
      await expect(iterator.next()).resolves.toHaveProperty("done", true);

      const restricted = randomPutObject();
      restricted.allowed = [];
      await graffiti.put(restricted, session1);
      const iterator2 = graffiti.discover(
        restricted.channels,
        publicSchema,
        session1,
      );
      await expect(iterator2.next()).resolves.toHaveProperty("done", true);
    });

    it("discover query for values", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();

      const object1 = randomPutObject();
      object1.value = { test: randomString() };
      await graffiti.put(object1, session);

      const object2 = randomPutObject();
      object2.channels = object1.channels;
      object2.value = { test: randomString(), something: randomString() };
      await graffiti.put(object2, session);

      const object3 = randomPutObject();
      object3.channels = object1.channels;
      object3.value = { other: randomString(), something: randomString() };
      await graffiti.put(object3, session);

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
      const graffiti = useGraffiti();
      const session = useSession1();

      const object = randomPutObject();
      const putted = await graffiti.put(object, session);
      const deleted = await graffiti.delete(putted, session);

      const iterator = graffiti.discover(object.channels, {});
      const result = (await iterator.next()).value;
      assert(result && !result.error, "result has no value");
      expect(result.value.tombstone).toBe(true);
      expect(result.value.value).toEqual(object.value);
      expect(result.value.channels).toEqual(object.channels);
      expect(result.value.actor).toEqual(session.actor);
      expect(result.value.lastModified).toEqual(deleted.lastModified);
      await expect(iterator.next()).resolves.toHaveProperty("done", true);
    });

    it("discover for replaced channels", async () => {
      // Do this a bunch to check for concurrency issues
      for (let i = 0; i < 10; i++) {
        const graffiti = useGraffiti();
        const session = useSession1();

        const object1 = randomPutObject();
        const putted = await graffiti.put(object1, session);
        const object2 = randomPutObject();
        const replaced = await graffiti.put(
          {
            ...putted,
            ...object2,
          },
          session,
        );

        const iterator1 = graffiti.discover(object1.channels, {});
        const result = (await iterator1.next()).value;
        assert(result && !result.error, "result has no value");
        await expect(iterator1.next()).resolves.toHaveProperty("done", true);

        const iterator2 = graffiti.discover(object2.channels, {});
        const result2 = (await iterator2.next()).value;
        assert(result2 && !result2.error, "result has no value");
        await expect(iterator2.next()).resolves.toHaveProperty("done", true);

        // If they have the same timestamp, except
        // only one to have a tombstone
        if (putted.lastModified === replaced.lastModified) {
          expect(result.value.tombstone || result2.value.tombstone).toBe(true);
          expect(result.value.tombstone && result2.value.tombstone).toBe(false);
        } else {
          expect(result.value.tombstone).toBe(true);
          expect(result.value.value).toEqual(object1.value);
          expect(result.value.channels).toEqual(object1.channels);
          expect(result.value.lastModified).toEqual(replaced.lastModified);

          expect(result2.value.tombstone).toBe(false);
          expect(result2.value.value).toEqual(object2.value);
          expect(result2.value.channels).toEqual(object2.channels);
          expect(result2.value.lastModified).toEqual(replaced.lastModified);
        }
      }
    });

    it("discover for patched allowed", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();
      const object = randomPutObject();
      const putted = await graffiti.put(object, session);
      await graffiti.patch(
        {
          allowed: [{ op: "add", path: "", value: [] }],
        },
        putted,
        session,
      );
      const iterator = graffiti.discover(object.channels, {});
      const result = (await iterator.next()).value;
      assert(result && !result.error, "result has no value");
      expect(result.value.tombstone).toBe(true);
      expect(result.value.value).toEqual(object.value);
      expect(result.value.channels).toEqual(object.channels);
      expect(result.value.allowed).toBeUndefined();
      await expect(iterator.next()).resolves.toHaveProperty("done", true);
    });
  });
};
