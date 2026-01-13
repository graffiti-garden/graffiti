import { afterAll, assert, describe, expect, test } from "vitest";
import { Inboxes } from "./4-inboxes";
import { GraffitiErrorUnauthorized, testLogin, testLogout } from "./utilities";
import type { JSONSchema } from "json-schema-to-ts";

const inboxEndpoint =
  "https://graffiti.actor/i/Nt1p97ela7MOhIBEF1cEYtXFupT8gkELFSWRxKQUVOM";

describe("Storage buckets", async () => {
  const token = await testLogin(inboxEndpoint);
  const inboxes = new Inboxes();

  afterAll(async () => {
    await testLogout(inboxEndpoint, token);
  });

  test("send, get", async () => {
    const message = "Hello, inbox!";

    const dataSchema = {
      type: "object",
      properties: {
        message: { type: "string" },
      },
      required: ["message"],
    } as const satisfies JSONSchema;

    const tags = [Math.random().toString(36).substring(2)];

    const messageId = await inboxes.send<typeof dataSchema>(inboxEndpoint, {
      tags,
      data: { message },
    });

    const iterator = inboxes.query<typeof dataSchema>(
      inboxEndpoint,
      tags,
      dataSchema,
      token,
    );

    const result = await iterator.next();
    assert(!result.done);

    // No label yet so it must be zero
    expect(result.value.label).toEqual(0);

    expect(result.value.message.tags).toEqual(tags);
    expect(result.value.message.data.message).toEqual(message);
    expect(result.value.messageId).toEqual(messageId);

    const endResult = await iterator.next();
    expect(endResult.done).toBe(true);

    // Label the message
    await inboxes.label(inboxEndpoint, messageId, 42, token);

    const iterator2 = inboxes.query<typeof dataSchema>(
      inboxEndpoint,
      tags,
      dataSchema,
      token,
    );

    const result2 = await iterator2.next();
    assert(!result2.done);
    expect(result2.value.label).toEqual(42);
    const endResult2 = await iterator.next();
    expect(endResult2.done).toBe(true);
  });

  test("query with continue", async () => {
    const tags = [Math.random().toString(36).substring(2)];

    const nullResult = await inboxes
      .query<{}>(inboxEndpoint, tags, {}, token)
      .next();
    assert(nullResult.done);
    const continue_ = nullResult.value.continue;

    const message = "Hello, inbox with continue!";
    const messageId = await inboxes.send<{}>(inboxEndpoint, {
      tags,
      data: { message },
    });

    const result = await continue_(token).next();
    assert(!result.done);
    expect(result.value.message.data).toHaveProperty("message", message);
    expect(result.value.message.tags).toEqual(tags);
    expect(result.value.messageId).toEqual(messageId);
    expect(result.value.label).toEqual(0);
  });

  test("unauthorized access", async () => {
    const tags = [Math.random().toString(36).substring(2)];

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

  test.skip("query paged", async () => {
    const tags = [Math.random().toString(36).substring(2)];

    for (let i = 0; i < 111; i++) {
      console.log(i);
      await inboxes.send<{}>(inboxEndpoint, {
        tags,
        data: { index: i },
      });
    }

    const iterator = inboxes.query(inboxEndpoint, tags, {}, token);

    let count = 0;
    for await (const _ of iterator) {
      count++;
    }

    expect(count).toBe(111);
  }, 100000);
});
