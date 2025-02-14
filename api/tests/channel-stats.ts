import { it, expect, describe, assert, beforeAll } from "vitest";
import type { Graffiti, GraffitiSession } from "@graffiti-garden/api";
import { randomString } from "./utils";

export const graffitiChannelStatsTests = (
  useGraffiti: () => Pick<
    Graffiti,
    "channelStats" | "put" | "delete" | "patch"
  >,
  useSession1: () => GraffitiSession | Promise<GraffitiSession>,
  useSession2: () => GraffitiSession | Promise<GraffitiSession>,
) => {
  describe("channel stats", { timeout: 20000 }, () => {
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

    it("list channels", async () => {
      const existingChannels: Map<string, number> = new Map();
      const channelIterator1 = graffiti.channelStats(session);
      for await (const channel of channelIterator1) {
        if (channel.error) continue;
        existingChannels.set(channel.value.channel, channel.value.count);
      }

      const channels = [randomString(), randomString(), randomString()];

      // Add one value to channels[0],
      // two values to both channels[0] and channels[1],
      // three values to all channels
      // one value to channels[2]
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < i + 1; j++) {
          await graffiti.put<{}>(
            {
              value: {
                index: j,
              },
              channels: channels.slice(0, i + 1),
            },
            session,
          );
        }
      }
      await graffiti.put<{}>(
        { value: { index: 3 }, channels: [channels[2]] },
        session,
      );

      const channelIterator2 = graffiti.channelStats(session);
      let newChannels: Map<string, number> = new Map();
      for await (const channel of channelIterator2) {
        if (channel.error) continue;
        newChannels.set(channel.value.channel, channel.value.count);
      }
      // Filter out existing channels
      newChannels = new Map(
        Array.from(newChannels).filter(
          ([channel, count]) => !existingChannels.has(channel),
        ),
      );
      expect(newChannels.size).toBe(3);
      expect(newChannels.get(channels[0])).toBe(6);
      expect(newChannels.get(channels[1])).toBe(5);
      expect(newChannels.get(channels[2])).toBe(4);
    });

    it("list channels with deleted channel", async () => {
      const channels = [randomString(), randomString(), randomString()];

      // Add an item with two channels
      const before = await graffiti.put<{}>(
        {
          value: { index: 2 },
          channels: channels.slice(1),
        },
        session,
      );

      // Add an item with all channels
      const first = await graffiti.put<{}>(
        { value: { index: 0 }, channels },
        session,
      );
      // But then delete it
      await graffiti.delete(first, session);

      // Create a new object with only one channel
      const second = await graffiti.put<{}>(
        {
          value: { index: 1 },
          channels: channels.slice(2),
        },
        session,
      );

      const channelIterator = graffiti.channelStats(session);

      let got1 = 0;
      let got2 = 0;
      for await (const result of channelIterator) {
        if (result.error) continue;
        const { channel, count, lastModified } = result.value;
        assert(
          channel !== channels[0],
          "There should not be an object in channel[0]",
        );
        if (channel === channels[1]) {
          expect(count).toBe(1);
          expect(lastModified).toBe(before.lastModified);
          got1++;
        } else if (channel === channels[2]) {
          expect(count).toBe(2);
          expect(lastModified).toBe(second.lastModified);
          got2++;
        }
      }
      expect(got1).toBe(1);
      expect(got2).toBe(1);
    });
  });
};
