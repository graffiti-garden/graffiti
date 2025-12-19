import { it, expect, describe, assert, beforeAll } from "vitest";
import type {
  Graffiti,
  GraffitiSession,
  JSONSchema,
} from "@graffiti-garden/api";
import {
  GraffitiErrorForbidden,
  GraffitiErrorInvalidSchema,
  GraffitiErrorNotFound,
} from "@graffiti-garden/api";
import {
  randomString,
  nextStreamValue,
  randomPostObject,
  continueStream,
} from "./utils";

export const graffitiDiscoverTests = (
  useGraffiti: () => Pick<
    Graffiti,
    "discover" | "post" | "delete" | "continueDiscover"
  >,
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
      const object = randomPostObject();

      const posted = await graffiti.post<{}>(object, session);

      const queryChannels = [randomString(), object.channels[0]];
      const iterator = graffiti.discover<{}>(queryChannels, {});
      const value = await nextStreamValue<{}>(iterator);
      expect(value.url).toEqual(posted.url);
      expect(value.value).toEqual(object.value);
      expect(value.channels).toEqual([object.channels[0]]);
      expect(value.allowed).toBeUndefined();
      expect(value.actor).toEqual(session.actor);
      const result2 = await iterator.next();
      expect(result2.done).toBe(true);
    });

    it("discover wrong channel", async () => {
      const object = randomPostObject();
      await graffiti.post<{}>(object, session);
      const iterator = graffiti.discover([randomString()], {});
      await expect(iterator.next()).resolves.toHaveProperty("done", true);
    });

    it("discover not allowed", async () => {
      const object = randomPostObject();
      object.allowed = [randomString(), randomString()];
      const posted = await graffiti.post<{}>(object, session1);

      const iteratorSession1 = graffiti.discover<{}>(
        object.channels,
        {},
        session1,
      );
      const value = await nextStreamValue<{}>(iteratorSession1);
      expect(value.url).toEqual(posted.url);
      expect(value.value).toEqual(object.value);
      expect(value.channels).toEqual(object.channels);
      expect(value.allowed).toEqual(object.allowed);
      expect(value.actor).toEqual(session1.actor);

      const iteratorSession2 = graffiti.discover(object.channels, {}, session2);
      expect(await iteratorSession2.next()).toHaveProperty("done", true);

      const iteratorNoSession = graffiti.discover(object.channels, {});
      expect(await iteratorNoSession.next()).toHaveProperty("done", true);
    });

    it("discover allowed", async () => {
      const object = randomPostObject();
      object.allowed = [randomString(), session2.actor, randomString()];
      const posted = await graffiti.post<{}>(object, session1);

      const iteratorSession2 = graffiti.discover<{}>(
        object.channels,
        {},
        session2,
      );
      const value = await nextStreamValue<{}>(iteratorSession2);
      expect(value.url).toEqual(posted.url);
      expect(value.value).toEqual(object.value);
      expect(value.allowed).toEqual([session2.actor]);
      expect(value.channels).toEqual(object.channels);
      expect(value.actor).toEqual(session1.actor);
    });

    it("discover bad schema", async () => {
      const iterator = graffiti.discover([], {
        properties: {
          value: {
            //@ts-ignore
            type: "asdf",
          },
        },
      });

      await expect(iterator.next()).rejects.toThrow(GraffitiErrorInvalidSchema);
    });

    it("discover for actor", async () => {
      const object1 = randomPostObject();
      const posted1 = await graffiti.post<{}>(object1, session1);

      const object2 = randomPostObject();
      object2.channels = object1.channels;
      const posted2 = await graffiti.post<{}>(object2, session2);

      const iterator = graffiti.discover<{}>(object1.channels, {
        properties: {
          actor: { const: posted1.actor },
        },
      });

      const value = await nextStreamValue<{}>(iterator);
      expect(value.url).toEqual(posted1.url);
      expect(value.url).not.toEqual(posted2.url);
      expect(value.value).toEqual(object1.value);
      await expect(iterator.next()).resolves.toHaveProperty("done", true);
    });

    it("discover schema allowed, as and not as owner", async () => {
      const object = randomPostObject();
      object.allowed = [randomString(), session2.actor, randomString()];
      await graffiti.post<{}>(object, session1);

      const iteratorSession1 = graffiti.discover<{}>(
        object.channels,
        {
          properties: {
            allowed: {
              minItems: 3,
              // Make sure session2.actor is in the allow list
              not: {
                items: {
                  not: { const: session2.actor },
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
                  not: { const: object.allowed[0] },
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
                  not: { const: session2.actor },
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
      const object = randomPostObject();
      object.channels = [randomString(), randomString(), randomString()];
      await graffiti.post<{}>(object, session1);

      const iteratorSession1 = graffiti.discover<{}>(
        [object.channels[0], object.channels[2]],
        {
          properties: {
            channels: {
              minItems: 3,
              // Make sure channel 1 is in the allow list
              not: {
                items: {
                  not: { const: object.channels[1] },
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
                  not: { const: object.channels[1] },
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
                  not: { const: object.channels[2] },
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
      const publicO = randomPostObject();

      const publicSchema = {
        not: {
          required: ["allowed"],
        },
      } satisfies JSONSchema;

      await graffiti.post<{}>(publicO, session1);
      const iterator = graffiti.discover<{}>(
        publicO.channels,
        publicSchema,
        session1,
      );
      const value = await nextStreamValue<{}>(iterator);
      expect(value.value).toEqual(publicO.value);
      expect(value.allowed).toBeUndefined();
      await expect(iterator.next()).resolves.toHaveProperty("done", true);

      const restricted = randomPostObject();
      restricted.allowed = [];
      await graffiti.post<{}>(restricted, session1);
      const iterator2 = graffiti.discover(
        restricted.channels,
        publicSchema,
        session1,
      );
      await expect(iterator2.next()).resolves.toHaveProperty("done", true);
    });

    it("discover query for values", async () => {
      const object1 = randomPostObject();
      object1.value = { test: randomString() };
      await graffiti.post<{}>(object1, session);

      const object2 = randomPostObject();
      object2.channels = object1.channels;
      object2.value = { test: randomString(), something: randomString() };
      await graffiti.post<{}>(object2, session);

      const object3 = randomPostObject();
      object3.channels = object1.channels;
      object3.value = { other: randomString(), something: randomString() };
      await graffiti.post<{}>(object3, session);

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

    for (const continueType of ["cursor", "continue"] as const) {
      describe(`continue discover with ${continueType}`, () => {
        it("discover for deleted content", async () => {
          const object = randomPostObject();

          const posted = await graffiti.post<{}>(object, session);

          const iterator1 = graffiti.discover<{}>(object.channels, {});
          const value1 = await nextStreamValue<{}>(iterator1);
          expect(value1.value).toEqual(object.value);
          const returnValue = await iterator1.next();
          assert(returnValue.done, "value2 is not done");

          await graffiti.delete(posted, session);

          const iterator = graffiti.discover(object.channels, {});
          await expect(iterator.next()).resolves.toHaveProperty("done", true);

          const tombIterator = continueStream<{}>(
            graffiti,
            returnValue.value,
            continueType,
          );
          const value = await tombIterator.next();
          assert(!value.done && !value.value.error, "value is done");
          assert(value.value.tombstone, "value is not tombstone");
          expect(value.value.object.url).toEqual(posted.url);
          const returnValue2 = await tombIterator.next();
          assert(returnValue2.done, "value2 is not done");

          // Post another object
          const posted2 = await graffiti.post<{}>(object, session);
          const doubleContinueIterator = continueStream<{}>(
            graffiti,
            returnValue2.value,
            continueType,
          );
          const value2 = await doubleContinueIterator.next();
          assert(!value2.done && !value2.value.error, "value2 is done");
          assert(!value2.value.tombstone, "value2 is tombstone");
          expect(value2.value.object.url).toEqual(posted2.url);
          await expect(doubleContinueIterator.next()).resolves.toHaveProperty(
            "done",
            true,
          );
        });

        it("continue with wrong actor", async () => {
          const iterator = graffiti.discover<{}>([], {}, session1);
          const result = await iterator.next();
          assert(result.done, "iterator is not done");

          const continuation = continueStream<{}>(
            graffiti,
            result.value,
            continueType,
            session2,
          );
          await expect(continuation.next()).rejects.toThrow(
            GraffitiErrorForbidden,
          );
        });
      });
    }

    it("lookup non-existant cursor", async () => {
      const iterator = graffiti.continueDiscover(randomString());
      await expect(iterator.next()).rejects.toThrow(GraffitiErrorNotFound);
    });
  });
};
