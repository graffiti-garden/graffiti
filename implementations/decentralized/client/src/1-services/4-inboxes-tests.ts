import { assert, describe, expect, test } from "vitest";
import { Inboxes } from "./4-inboxes";
import { GraffitiErrorUnauthorized } from "./utilities";
import { randomBytes } from "@noble/hashes/utils.js";
import type { GraffitiObjectBase } from "@graffiti-garden/api";

export function inboxTests(inboxEndpoint: string, inboxToken: string) {
  describe("Inboxes", async () => {
    const inboxes = new Inboxes();

    test("send, get", async () => {
      const tags = [randomBytes(), randomBytes()];
      const metadata = randomBytes();
      const object: GraffitiObjectBase = {
        url: "url:example",
        actor: "did:example",
        channels: ["example", "something"],
        value: {
          nested: {
            property: [1, "askdfj", null],
          },
        },
        allowed: ["did:example2"],
      };

      const messageId = await inboxes.send(inboxEndpoint, {
        m: metadata,
        o: object,
        t: tags,
      });

      const iterator = inboxes.query<{}>(inboxEndpoint, tags, {}, inboxToken);

      const result = await iterator.next();
      assert(!result.done);

      // No label yet so it must be zero
      expect(result.value.l).toEqual(0);

      expect(result.value.m.t).toEqual(tags);
      expect(result.value.m.o).toEqual(object);
      expect(result.value.id).toEqual(messageId);

      const endResult = await iterator.next();
      expect(endResult.done).toBe(true);

      // Label the message
      await inboxes.label(inboxEndpoint, messageId, 42, inboxToken);

      const iterator2 = inboxes.query<{}>(inboxEndpoint, tags, {}, inboxToken);

      const result2 = await iterator2.next();
      assert(!result2.done);
      expect(result2.value.l).toEqual(42);
      const endResult2 = await iterator2.next();
      expect(endResult2.done).toBe(true);
    });

    test("query with continue", async () => {
      const tags = [randomBytes(), randomBytes()];

      const nullResult = await inboxes
        .query<{}>(inboxEndpoint, tags, {}, inboxToken)
        .next();
      assert(nullResult.done);
      const cursor = nullResult.value;

      const metadata = randomBytes();

      const messageId = await inboxes.send(inboxEndpoint, {
        o: {
          url: "url:example",
          actor: "did:example",
          channels: ["example", "something"],
          value: {
            nested: {
              property: [1, "askdfj", null],
            },
          },
          allowed: ["did:example2"],
        },
        t: [randomBytes(), tags[0]],
        m: metadata,
      });

      const result = await inboxes
        .continueQuery(inboxEndpoint, cursor, inboxToken)
        .next();
      assert(!result.done);
      expect(result.value.id).toEqual(messageId);
    });

    test("unauthorized access", async () => {
      const tags = [randomBytes()];

      await expect(
        inboxes.query(inboxEndpoint, tags, {}, "invalid-token").next(),
      ).rejects.toThrowError(GraffitiErrorUnauthorized);
      await expect(
        inboxes.label(inboxEndpoint, "1", 1, "invalid-token"),
      ).rejects.toThrowError(GraffitiErrorUnauthorized);
      await expect(
        inboxes.export(inboxEndpoint, "invalid-token").next(),
      ).rejects.toThrowError(GraffitiErrorUnauthorized);
    });

    test("query paged", async () => {
      const tags = [randomBytes(), randomBytes()];

      const numSends = 211;
      for (let i = 0; i < numSends; i++) {
        await inboxes.send(inboxEndpoint, {
          t: tags,
          m: randomBytes(),
          o: {
            url: "url:example",
            actor: "did:example",
            channels: ["example", "something"],
            value: {
              nested: {
                property: [1, "askdfj", null],
              },
            },
            allowed: ["did:example2"],
          },
        });
      }

      const iterator = inboxes.query(
        inboxEndpoint,
        [randomBytes(), tags[1], randomBytes()],
        {},
        inboxToken,
      );

      let count = 0;
      for await (const _ of iterator) {
        count++;
      }

      expect(count).toBe(numSends);
    }, 100000);
  });
}
