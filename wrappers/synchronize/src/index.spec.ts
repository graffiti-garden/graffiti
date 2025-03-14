import { it, expect, describe, assert, beforeAll } from "vitest";
import type { GraffitiSession } from "@graffiti-garden/api";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { randomPutObject, randomString } from "@graffiti-garden/api/tests";
import { GraffitiSynchronize } from "./index";

const useGraffiti = () => new GraffitiSynchronize(new GraffitiLocal());
const graffiti = useGraffiti();

const useSession1 = async () => {
  return {
    actor: randomString(),
  };
};
const useSession2 = async () => {
  return {
    actor: randomString(),
  };
};

describe.concurrent("synchronizeDiscover", () => {
  let session: GraffitiSession;
  let session1: GraffitiSession;
  let session2: GraffitiSession;
  beforeAll(async () => {
    session1 = await useSession1();
    session = session1;
    session2 = await useSession2();
  });

  it("get", async () => {
    const graffiti1 = useGraffiti();

    const object = randomPutObject();
    const channels = object.channels.slice(1);
    const putted = await graffiti1.put<{}>(object, session);

    const graffiti2 = useGraffiti();
    const next = graffiti2.synchronizeDiscover(channels, {}).next();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const gotten = await graffiti2.get(putted, {}, session);

    const result = await next;
    if (result.done || result.value.error) {
      throw new Error("Error in synchronize");
    }
    assert(!result.value.tombstone);
    expect(result.value.object.value).toEqual(object.value);
    expect(result.value.object.channels).toEqual(channels);
    expect(result.value.object.lastModified).toEqual(gotten.lastModified);
  });

  it("put", async () => {
    const beforeChannel = randomString();
    const afterChannel = randomString();
    const sharedChannel = randomString();

    // Start listening for changes...
    const beforeIterator = graffiti.synchronizeDiscover([beforeChannel], {});
    // Skip the first result
    beforeIterator.next();

    const oldValue = { hello: "world" };
    const oldChannels = [beforeChannel, sharedChannel];
    const putted = await graffiti.put<{}>(
      {
        value: oldValue,
        channels: oldChannels,
      },
      session,
    );

    const beforeButAfter = graffiti
      .synchronizeDiscover([beforeChannel], {})
      .next();
    const before = beforeIterator.next();
    const after = graffiti.synchronizeDiscover([afterChannel], {}).next();
    const shared = graffiti.synchronizeDiscover([sharedChannel], {}).next();

    // Replace the object
    const newValue = { goodbye: "world" };
    const newChannels = [afterChannel, sharedChannel];
    const putted2 = await graffiti.put<{}>(
      {
        url: putted.url,
        value: newValue,
        channels: newChannels,
      },
      session,
    );

    // If you just start synchronizing after the first put,
    // it won't show the deletion because it never saw the object.
    await expect(
      // @ts-ignore
      Promise.race([
        beforeButAfter,
        new Promise((resolve, reject) => setTimeout(reject, 100, "Timeout")),
      ]),
    ).rejects.toThrow("Timeout");

    const beforeResult = await before;
    const afterResult = await after;
    const sharedResult = await shared;
    assert(!beforeResult.done && !beforeResult.value.error, "Error in before");
    assert(!afterResult.done && !afterResult.value.error, "Error in after");
    assert(!sharedResult.done && !sharedResult.value.error, "Error in shared");

    assert(beforeResult.value.tombstone, "Before is not tombstone");
    assert(!afterResult.value.tombstone, "After is tombstone");
    assert(!sharedResult.value.tombstone, "Shared is tombstone");

    expect(beforeResult.value.object.url).toEqual(putted.url);
    expect(beforeResult.value.object.lastModified).toEqual(
      putted2.lastModified,
    );
    expect(afterResult.value.object.value).toEqual(newValue);
    expect(afterResult.value.object.channels).toEqual([afterChannel]);
    expect(sharedResult.value.object.value).toEqual(newValue);
    expect(sharedResult.value.object.channels).toEqual([sharedChannel]);
    expect(beforeResult.value.object.lastModified).toEqual(
      afterResult.value.object.lastModified,
    );
    expect(sharedResult.value.object.lastModified).toEqual(
      afterResult.value.object.lastModified,
    );
  });

  it("patch", async () => {
    const beforeChannel = randomString();
    const afterChannel = randomString();
    const sharedChannel = randomString();

    // Start listening for changes...
    const beforeIterator = graffiti.synchronizeDiscover([beforeChannel], {});
    // Skip the first result
    beforeIterator.next();

    const oldValue = { hello: "world" };
    const oldChannels = [beforeChannel, sharedChannel];
    const putted = await graffiti.put<{}>(
      {
        value: oldValue,
        channels: oldChannels,
      },
      session,
    );

    const beforeButAfter = graffiti
      .synchronizeDiscover([beforeChannel], {})
      .next();
    const before = beforeIterator.next();
    const after = graffiti.synchronizeDiscover([afterChannel], {}).next();
    const shared = graffiti.synchronizeDiscover([sharedChannel], {}).next();

    const patched = await graffiti.patch(
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

    // If you just start synchronizing after the first put,
    // it won't show the deletion because it never saw the object.
    await expect(
      // @ts-ignore
      Promise.race([
        beforeButAfter,
        new Promise((resolve, reject) => setTimeout(reject, 100, "Timeout")),
      ]),
    ).rejects.toThrow("Timeout");

    const beforeResult = await before;
    const afterResult = await after;
    const sharedResult = await shared;
    assert(!beforeResult.done && !beforeResult.value.error, "Error in before");
    assert(!afterResult.done && !afterResult.value.error, "Error in after");
    assert(!sharedResult.done && !sharedResult.value.error, "Error in shared");

    assert(beforeResult.value.tombstone, "Before is not tombstone");
    assert(!afterResult.value.tombstone, "After is tombstone");
    assert(!sharedResult.value.tombstone, "Shared is tombstone");

    const newValue = { ...oldValue, something: "new value" };
    expect(beforeResult.value.object.url).toEqual(putted.url);
    expect(beforeResult.value.object.lastModified).toEqual(
      patched.lastModified,
    );
    expect(afterResult.value.object.value).toEqual(newValue);
    expect(afterResult.value.object.channels).toEqual([afterChannel]);
    expect(sharedResult.value.object.value).toEqual(newValue);
    expect(sharedResult.value.object.channels).toEqual([sharedChannel]);
    expect(beforeResult.value.object.lastModified).toEqual(
      afterResult.value.object.lastModified,
    );
    expect(sharedResult.value.object.lastModified).toEqual(
      afterResult.value.object.lastModified,
    );
  });

  it("delete", async () => {
    const channels = [randomString(), randomString(), randomString()];

    // Start listening for changes...
    const beforeIterator = graffiti.synchronizeDiscover(channels, {});
    // Skip the first result
    beforeIterator.next();

    const oldValue = { hello: "world" };
    const oldChannels = [randomString(), ...channels.slice(1)];
    const putted = await graffiti.put<{}>(
      {
        value: oldValue,
        channels: oldChannels,
      },
      session,
    );

    const beforeButAfter = graffiti.synchronizeDiscover(channels, {}).next();
    const next = beforeIterator.next();

    const deleted = await graffiti.delete(putted, session);

    // If you just start synchronizing after the first put,
    // it won't show the deletion because it never saw the object.
    await expect(
      // @ts-ignore
      Promise.race([
        beforeButAfter,
        new Promise((resolve, reject) => setTimeout(reject, 100, "Timeout")),
      ]),
    ).rejects.toThrow("Timeout");

    const result = await next;
    assert(!result.done && !result.value.error, "Error in before");
    assert(result.value.tombstone, "Before is not tombstone");
    expect(result.value.object.url).toEqual(putted.url);
    expect(result.value.object.lastModified).toEqual(deleted.lastModified);
  });

  it("synchronize happens before putters", async () => {
    const object = randomPutObject();
    const iterator = graffiti.synchronizeDiscover(object.channels, {});

    for (let i = 0; i < 10; i++) {
      const next = iterator.next();
      const putted = graffiti.put<{}>(object, session);

      let first: undefined | string = undefined;
      next.then(() => {
        if (!first) first = "synchronize";
      });
      putted.then(() => {
        if (!first) first = "put";
      });
      await putted;

      expect(first).toBe("synchronize");

      const patched = graffiti.patch({}, await putted, session);
      const next2 = iterator.next();

      let second: undefined | string = undefined;
      next2.then(() => {
        if (!second) second = "synchronize";
      });
      patched.then(() => {
        if (!second) second = "patch";
      });
      await patched;

      expect(second).toBe("synchronize");

      const deleted = graffiti.delete(await putted, session);
      const next3 = iterator.next();

      let third: undefined | string = undefined;
      next3.then(() => {
        if (!third) third = "synchronize";
      });
      deleted.then(() => {
        if (!third) third = "delete";
      });
      await deleted;

      expect(third).toBe("synchronize");
    }

    // Try returning...
    iterator.return({
      continue: () => iterator,
      cursor: "",
    });
  });

  it("not allowed", async () => {
    const allChannels = [randomString(), randomString(), randomString()];
    const channels = allChannels.slice(1);

    const creatorNext = graffiti
      .synchronizeDiscover(channels, {}, session1)
      .next();
    const allowedNext = graffiti
      .synchronizeDiscover(channels, {}, session2)
      .next();
    const noSession = graffiti.synchronizeDiscover(channels, {}).next();

    const value = {
      hello: "world",
    };
    const allowed = [randomString(), session2.actor];
    await graffiti.put<{}>({ value, channels: allChannels, allowed }, session1);

    // Expect no session to time out!
    await expect(
      // @ts-ignore - otherwise you might get
      // "Type instantiation is excessively deep
      //  and possibly infinite."
      Promise.race([
        noSession,
        new Promise((resolve, rejects) => setTimeout(rejects, 100, "Timeout")),
      ]),
    ).rejects.toThrow("Timeout");

    const creatorResult = await creatorNext;
    const allowedResult = await allowedNext;

    assert(
      !creatorResult.done &&
        !creatorResult.value.error &&
        !creatorResult.value.tombstone,
      "Error in creator",
    );
    assert(
      !allowedResult.done &&
        !allowedResult.value.error &&
        !allowedResult.value.tombstone,
      "Error in allowed",
    );

    expect(creatorResult.value.object.value).toEqual(value);
    expect(creatorResult.value.object.allowed).toEqual(allowed);
    expect(creatorResult.value.object.channels).toEqual(allChannels);
    expect(allowedResult.value.object.value).toEqual(value);
    expect(allowedResult.value.object.allowed).toEqual([session2.actor]);
    expect(allowedResult.value.object.channels).toEqual(channels);
  });
});

describe.concurrent("synchronizeGet", () => {
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

  it("replace, delete", async () => {
    const object = randomPutObject();
    const putted = await graffiti.put<{}>(object, session);

    const iterator = graffiti.synchronizeGet(putted, {});
    const next = iterator.next();

    // Change the object
    const newValue = { goodbye: "world" };
    const putted2 = await graffiti.put<{}>(
      {
        url: putted.url,
        channels: object.channels,
        value: newValue,
      },
      session,
    );

    const result = await next;
    assert(!result.done && !result.value.error && !result.value.tombstone);

    expect(result.value.object.value).toEqual(newValue);
    expect(result.value.object.actor).toEqual(session.actor);
    expect(result.value.object.channels).toEqual([]);
    expect(result.value.object.lastModified).toEqual(putted2.lastModified);
    expect(result.value.object.allowed).toBeUndefined();

    // Delete the object
    const deleted = await graffiti.delete(putted2, session);
    const result2 = await iterator.next();
    assert(!result2.done && !result2.value.error);
    expect(result2.value.tombstone).toBe(true);
    expect(result2.value.object.lastModified).toEqual(deleted.lastModified);

    // Put something else
    await graffiti.put<{}>(randomPutObject(), session);
    await expect(
      // @ts-ignore - otherwise you might get
      // "Type instantiation is excessively deep
      //  and possibly infinite."
      Promise.race([
        iterator.next(),
        new Promise((resolve, reject) => setTimeout(reject, 100, "Timeout")),
      ]),
    ).rejects.toThrow("Timeout");
  });

  it("not allowed", async () => {
    const object = randomPutObject();
    const putted = await graffiti.put<{}>(object, session1);

    const iterator1 = graffiti.synchronizeGet(putted, {}, session1);
    const iterator2 = graffiti.synchronizeGet(putted, {}, session2);

    // Do a get to trigger the synchronize
    graffiti.get<{}>(putted, {}, session1);
    iterator1.next();
    iterator2.next();

    const next1 = iterator1.next();
    const next2 = iterator2.next();

    const newValue = { goodbye: "world" };
    const putted2 = await graffiti.put<{}>(
      {
        ...putted,
        ...object,
        allowed: [],
        value: newValue,
      },
      session1,
    );

    const result1 = await next1;
    const result2 = await next2;
    assert(!result1.done && !result1.value.error);
    assert(!result2.done && !result2.value.error);
    assert(!result1.value.tombstone);
    assert(result2.value.tombstone);

    expect(result1.value.object.value).toEqual(newValue);
    expect(result1.value.object.actor).toEqual(session1.actor);
    expect(result1.value.object.channels).toEqual(object.channels);
    expect(result1.value.object.lastModified).toEqual(putted2.lastModified);
    expect(result2.value.object.url).toEqual(putted.url);
    expect(result2.value.object.lastModified).toEqual(putted2.lastModified);
  });
});

// can't be concurrent because it gets ALL
describe("synchronizeAll", () => {
  let session: GraffitiSession;
  let session1: GraffitiSession;
  let session2: GraffitiSession;
  beforeAll(async () => {
    session1 = await useSession1();
    session = session1;
    session2 = await useSession2();
  });

  it("sync from multiple channels and actors", async () => {
    const object1 = randomPutObject();
    const object2 = randomPutObject();

    expect(object1.channels).not.toEqual(object2.channels);

    const iterator = graffiti.synchronizeAll({});

    const next1 = iterator.next();
    const next2 = iterator.next();

    await graffiti.put<{}>(object1, session1);
    await graffiti.put<{}>(object2, session2);

    const result1 = await next1;
    const result2 = await next2;
    assert(!result1.done && !result1.value.error && !result1.value.tombstone);
    assert(!result2.done && !result2.value.error && !result2.value.tombstone);

    expect(result1.value.object.value).toEqual(object1.value);
    expect(result1.value.object.channels).toEqual([]);
    expect(result2.value.object.value).toEqual(object2.value);
  });

  it("omniscient", async () => {
    const graffiti = new GraffitiSynchronize(new GraffitiLocal(), {
      omniscient: true,
    });

    const object1 = randomPutObject();
    object1.allowed = [randomString()];

    const iterator = graffiti.synchronizeAll({});
    const next = iterator.next();

    await graffiti.put<{}>(object1, session1);

    const result = await next;
    assert(!result.done && !result.value.error && !result.value.tombstone);
    expect(result.value.object.value).toEqual(object1.value);
    expect(result.value.object.channels).toEqual(object1.channels);
    expect(result.value.object.allowed).toEqual(object1.allowed);
  });
});
