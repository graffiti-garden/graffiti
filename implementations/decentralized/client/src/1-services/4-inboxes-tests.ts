import { assert, describe, expect, test } from "vitest";
import { Inboxes, LABELED_MESSAGE_LABEL_KEY } from "./4-inboxes";
import { GraffitiErrorUnauthorized } from "./utilities";
import { randomBytes } from "@noble/hashes/utils.js";
import type { GraffitiObjectBase } from "@graffiti-garden/api";
import { encode as dagCborEncode, decode as dagCborDecode } from "@ipld/dag-cbor";

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

      const sending = {
        m: metadata,
        o: object,
        t: tags,
      };
      const messageId = await inboxes.send(inboxEndpoint, sending);

      // Get the message back
      const message = await inboxes.get(inboxEndpoint, messageId, inboxToken);
      assert(message !== null);
      expect(message.m).toEqual(sending);
      expect(message.l).toEqual(0);

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

      const message2 = await inboxes.get(inboxEndpoint, messageId, inboxToken);
      assert(message2 !== null);
      expect(message2.m).toEqual(sending);
      expect(message2.l).toEqual(42);
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
    }, 30000);

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

      let cursor: string | undefined;
      for (const [page, expectedCount] of [10, 100, 101].entries()) {
        const response = await fetch(
          `${inboxEndpoint}/query${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/cbor",
              Authorization: `Bearer ${inboxToken}`,
            },
            body: cursor ? undefined : dagCborEncode({ tags: [tags[1]], schema: {} }).slice(),
          },
        );
        expect(response.status).toBe(200);
        const pageResult = dagCborDecode(new Uint8Array(await response.arrayBuffer())) as {
          results: unknown[];
          hasMore: boolean;
          cursor: string;
        };
        expect(pageResult.results).toHaveLength(expectedCount);
        expect(pageResult.hasMore).toBe(page < 2);
        cursor = pageResult.cursor;
      }

      // Opting into the finite stream keeps the paged API intact. Each
      // length-prefixed CBOR frame is a complete query page.
      const streamed = await fetch(`${inboxEndpoint}/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/cbor",
          Accept: "application/vnd.graffiti.inbox-stream",
          Authorization: `Bearer ${inboxToken}`,
        },
        body: dagCborEncode({ tags: [tags[1]], schema: {} }).slice(),
      });
      expect(streamed.status).toBe(200);
      expect(streamed.headers.get("Content-Type")).toContain("application/vnd.graffiti.inbox-stream");
      const frames = new Uint8Array(await streamed.arrayBuffer());
      const sizes: number[] = [];
      let offset = 0;
      while (offset < frames.length) {
        const size = new DataView(frames.buffer).getUint32(offset);
        offset += 4;
        const page = dagCborDecode(frames.subarray(offset, offset + size)) as {
          results: unknown[];
          hasMore: boolean;
          cursor: string;
        };
        sizes.push(page.results.length);
        expect(page.hasMore).toBe(offset + size < frames.length);
        expect(page.cursor).toBeTruthy();
        offset += size;
      }
      expect(sizes).toEqual([10, 201]);

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
