import { it, expect, describe } from "vitest";
import { type GraffitiFactory, type GraffitiSessionBase } from "../src/index";

export const graffitiSynchronizeTests = (
  useGraffiti: GraffitiFactory,
  useSession1: () => GraffitiSessionBase,
  useSession2: () => GraffitiSessionBase,
) => {
  describe("synchronize", () => {
    it("get", async () => {
      const graffiti1 = useGraffiti();
      const session = useSession1();

      const allChannels = ["channel", "other"];
      const channels = [allChannels[0]];
      const value = { hello: "world" };
      const putted = await graffiti1.put(
        {
          value,
          channels: allChannels,
        },
        session,
      );

      const graffiti2 = useGraffiti();
      const next = graffiti2.synchronize(channels, {}).next();
      const gotten = await graffiti2.get(putted, {}, session);

      const result = (await next).value;
      if (!result || result.error) {
        throw new Error("Error in synchronize");
      }
      expect(result.value.value).toEqual(value);
      expect(result.value.channels).toEqual(channels);
      expect(result.value.tombstone).toBe(false);
      expect(result.value.lastModified.getTime()).toEqual(
        gotten.lastModified.getTime(),
      );
    });

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
      expect(beforeResult.value.channels).toEqual([beforeChannel]);
      expect(beforeResult.value.tombstone).toBe(true);
      expect(afterResult.value.value).toEqual(newValue);
      expect(afterResult.value.channels).toEqual([afterChannel]);
      expect(afterResult.value.tombstone).toBe(false);
      expect(sharedResult.value.value).toEqual(newValue);
      expect(sharedResult.value.channels).toEqual([sharedChannel]);
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

      const newValue = { ...oldValue, something: "new value" };
      const newChannels = [sharedChannel, afterChannel];
      expect(beforeResult.value.value).toEqual(oldValue);
      expect(beforeResult.value.channels).toEqual([beforeChannel]);
      expect(beforeResult.value.tombstone).toBe(true);
      expect(afterResult.value.value).toEqual(newValue);
      expect(afterResult.value.channels).toEqual([afterChannel]);
      expect(afterResult.value.tombstone).toBe(false);
      expect(sharedResult.value.value).toEqual(newValue);
      expect(sharedResult.value.channels).toEqual([sharedChannel]);
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
      expect(result.value.channels).toEqual(
        channels.filter((c) => oldChannels.includes(c)),
      );
    });

    it("not allowed", async () => {
      const graffiti = useGraffiti();
      const session1 = useSession1();
      const session2 = useSession2();

      const allChannels = ["channel", "other"];
      const channels = [allChannels[0]];

      const creatorNext = graffiti.synchronize(channels, {}, session1).next();
      const allowedNext = graffiti.synchronize(channels, {}, session2).next();
      const noSession = graffiti.synchronize(channels, {}).next();

      const value = {
        hello: "world",
      };
      const allowed = ["asdf", session2.actor];
      await graffiti.put({ value, channels: allChannels, allowed }, session1);

      // Expect no session to time out!
      await expect(
        Promise.race([
          noSession,
          new Promise((resolve, rejects) =>
            setTimeout(rejects, 100, "Timeout"),
          ),
        ]),
      ).rejects.toThrow("Timeout");

      const creatorResult = (await creatorNext).value;
      const allowedResult = (await allowedNext).value;

      if (
        !creatorResult ||
        creatorResult.error ||
        !allowedResult ||
        allowedResult.error
      ) {
        throw new Error("Error in synchronize");
      }

      expect(creatorResult.value.value).toEqual(value);
      expect(creatorResult.value.allowed).toEqual(allowed);
      expect(creatorResult.value.channels).toEqual(allChannels);
      expect(allowedResult.value.value).toEqual(value);
      expect(allowedResult.value.allowed).toEqual([session2.actor]);
      expect(allowedResult.value.channels).toEqual(channels);
    });
  });
};
