import { it, expect, describe } from "vitest";
import { type GraffitiFactory, type GraffitiSession } from "../src/index";
import { randomString, randomValue, randomPutObject } from "./utils";

export const graffitiDiscoverTests = (
  useGraffiti: GraffitiFactory,
  useSession1: () => GraffitiSession,
  useSession2: () => GraffitiSession,
) => {
  describe("discover", () => {
    it("discover single", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();
      const object = randomPutObject();

      const putted = await graffiti.put(object, session);

      const queryChannels = [randomString(), object.channels[0]];
      const iterator = graffiti.discover(queryChannels, {});
      const result = (await iterator.next()).value;
      if (!result || result.error) throw new Error();
      expect(result.value.value).toEqual(object.value);
      expect(result.value.channels).toEqual([object.channels[0]]);
      expect(result.value.allowed).toBeUndefined();
      expect(result.value.actor).toEqual(session.actor);
      expect(result.value.tombstone).toBe(false);
      expect(result.value.lastModified).toEqual(putted.lastModified);
      const result2 = await iterator.next();
      expect(result2.done).toBe(true);
    });

    it("discover with lastModified range", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();

      const object = randomPutObject();
      const putted1 = await graffiti.put(object, session);
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
      if (!result || result.error) throw new Error();
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
      if (!result2 || result2.error) throw new Error();
      expect(result2.value.name).toEqual(putted1.name);
      expect(await lteIterator.next()).toHaveProperty("done", true);
    });
  });
};
