import { it, expect, describe } from "vitest";
import { type GraffitiFactory, type GraffitiSessionBase } from "../src/index";

export const graffitiSynchronizeTests = (
  useGraffiti: GraffitiFactory,
  useSession1: () => GraffitiSessionBase,
  useSession2: () => GraffitiSessionBase,
) => {
  describe("synchronize", () => {
    it("put", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();

      const beforeChannel = "before";
      const afterChannel = "after";
      const sharedChannel = "shared";

      const oldValue = { hello: "world" };
      const oldChannels = [beforeChannel, sharedChannel];
      const putted = await graffiti.put(
        {
          value: oldValue,
          channels: oldChannels,
        },
        session,
      );

      // Start listening for changes...
      const before = graffiti.synchronize([beforeChannel], {}).next();
      const after = graffiti.synchronize([afterChannel], {}).next();
      const shared = graffiti.synchronize([sharedChannel], {}).next();

      // Replace the object
      const newValue = { goodbye: "world" };
      const newChannels = [afterChannel, sharedChannel];
      await graffiti.put(
        {
          ...putted,
          value: newValue,
          channels: newChannels,
        },
        session,
      );

      const beforeResult = (await before).value;
      const afterResult = (await after).value;
      const sharedResult = (await shared).value;
      if (
        !beforeResult ||
        beforeResult.error ||
        !afterResult ||
        afterResult.error ||
        !sharedResult ||
        sharedResult.error
      ) {
        throw new Error("Error in synchronize");
      }

      expect(beforeResult.value.value).toEqual(oldValue);
      expect(beforeResult.value.channels).toEqual(oldChannels);
      expect(beforeResult.value.tombstone).toBe(true);
      expect(afterResult.value.value).toEqual(newValue);
      expect(afterResult.value.channels).toEqual(newChannels);
      expect(afterResult.value.tombstone).toBe(false);
      expect(sharedResult.value.value).toEqual(newValue);
      expect(sharedResult.value.channels).toEqual(newChannels);
      expect(sharedResult.value.tombstone).toBe(false);
      expect(beforeResult.value.lastModified.getTime()).toEqual(
        afterResult.value.lastModified.getTime(),
      );
      expect(sharedResult.value.lastModified.getTime()).toEqual(
        afterResult.value.lastModified.getTime(),
      );
    });

    it("patch", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();

      const beforeChannel = "before";
      const afterChannel = "after";
      const sharedChannel = "shared";

      const oldValue = { hello: "world" };
      const oldChannels = [beforeChannel, sharedChannel];
      const putted = await graffiti.put(
        {
          value: oldValue,
          channels: oldChannels,
        },
        session,
      );

      // Start listening for changes...
      const before = graffiti.synchronize([beforeChannel], {}).next();
      const after = graffiti.synchronize([afterChannel], {}).next();
      const shared = graffiti.synchronize([sharedChannel], {}).next();

      await graffiti.patch(
        {
          value: [
            {
              op: "add",
              path: "/something",
              value: "new value",
            },
          ],
          channels: [
            {
              op: "add",
              path: "/-",
              value: afterChannel,
            },
            {
              op: "remove",
              path: `/${oldChannels.indexOf(beforeChannel)}`,
            },
          ],
        },
        putted,
        session,
      );

      const beforeResult = (await before).value;
      const afterResult = (await after).value;
      const sharedResult = (await shared).value;
      if (
        !beforeResult ||
        beforeResult.error ||
        !afterResult ||
        afterResult.error ||
        !sharedResult ||
        sharedResult.error
      ) {
        throw new Error("Error in synchronize");
      }

      console.log(afterResult);

      const newValue = { ...oldValue, something: "new value" };
      const newChannels = [sharedChannel, afterChannel];
      expect(beforeResult.value.value).toEqual(oldValue);
      expect(beforeResult.value.channels).toEqual(oldChannels);
      expect(beforeResult.value.tombstone).toBe(true);
      expect(afterResult.value.value).toEqual(newValue);
      expect(afterResult.value.channels).toEqual(newChannels);
      expect(afterResult.value.tombstone).toBe(false);
      expect(sharedResult.value.value).toEqual(newValue);
      expect(sharedResult.value.channels).toEqual(newChannels);
      expect(sharedResult.value.tombstone).toBe(false);
      expect(beforeResult.value.lastModified.getTime()).toEqual(
        afterResult.value.lastModified.getTime(),
      );
      expect(sharedResult.value.lastModified.getTime()).toEqual(
        afterResult.value.lastModified.getTime(),
      );
    });

    it("delete", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();

      const channels = ["a", "b", "c"];

      const oldValue = { hello: "world" };
      const oldChannels = ["d", ...channels.slice(1)];
      const putted = await graffiti.put(
        {
          value: oldValue,
          channels: oldChannels,
        },
        session,
      );

      const next = graffiti.synchronize(channels, {}).next();

      graffiti.delete(putted, session);

      const result = (await next).value;
      if (!result || result.error) {
        throw new Error("Error in synchronize");
      }
      expect(result.value.tombstone).toBe(true);
      expect(result.value.value).toEqual(oldValue);
      expect(result.value.channels).toEqual(oldChannels);
    });
  });
};
