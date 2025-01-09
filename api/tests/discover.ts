import { it, expect, describe } from "vitest";
import { type GraffitiFactory, type GraffitiSessionBase } from "../src/index";
import { randomString, randomValue, randomPutObject } from "./utils";

export const graffitiDiscoverTests = (
  useGraffiti: GraffitiFactory,
  useSession1: () => GraffitiSessionBase,
  useSession2: () => GraffitiSessionBase,
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
  });
};
