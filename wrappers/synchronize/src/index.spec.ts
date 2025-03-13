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
    const gotten = await graffiti2.get(putted, {}, session);

    const result = (await next).value;
    if (!result || result.error) {
      throw new Error("Error in synchronize");
    }
    expect(result.value.value).toEqual(object.value);
    expect(result.value.channels).toEqual(channels);
    expect(result.value.tombstone).toBe(false);
    expect(result.value.lastModified).toEqual(gotten.lastModified);
  });

  it("put", async () => {
    const beforeChannel = randomString();
    const afterChannel = randomString();
    const sharedChannel = randomString();

    const oldValue = { hello: "world" };
    const oldChannels = [beforeChannel, sharedChannel];
    const putted = await graffiti.put<{}>(
      {
        value: oldValue,
        channels: oldChannels,
      },
      session,
    );

    // Start listening for changes...
    const before = graffiti.synchronizeDiscover([beforeChannel], {}).next();
    const after = graffiti.synchronizeDiscover([afterChannel], {}).next();
    const shared = graffiti.synchronizeDiscover([sharedChannel], {}).next();

    // Replace the object
    const newValue = { goodbye: "world" };
    const newChannels = [afterChannel, sharedChannel];
    await graffiti.put<{}>(
      {
        url: putted.url,
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
    expect(beforeResult.value.lastModified).toEqual(
      afterResult.value.lastModified,
    );
    expect(sharedResult.value.lastModified).toEqual(
      afterResult.value.lastModified,
    );
  });

  it("patch", async () => {
    const beforeChannel = randomString();
    const afterChannel = randomString();
    const sharedChannel = randomString();

    const oldValue = { hello: "world" };
    const oldChannels = [beforeChannel, sharedChannel];
    const putted = await graffiti.put<{}>(
      {
        value: oldValue,
        channels: oldChannels,
      },
      session,
    );

    // Start listening for changes...
    const before = graffiti.synchronizeDiscover([beforeChannel], {}).next();
    const after = graffiti.synchronizeDiscover([afterChannel], {}).next();
    const shared = graffiti.synchronizeDiscover([sharedChannel], {}).next();

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
    expect(beforeResult.value.lastModified).toEqual(
      afterResult.value.lastModified,
    );
    expect(sharedResult.value.lastModified).toEqual(
      afterResult.value.lastModified,
    );
  });

  it("delete", async () => {
    const channels = [randomString(), randomString(), randomString()];

    const oldValue = { hello: "world" };
    const oldChannels = [randomString(), ...channels.slice(1)];
    const putted = await graffiti.put<{}>(
      {
        value: oldValue,
        channels: oldChannels,
      },
      session,
    );

    const next = graffiti.synchronizeDiscover(channels, {}).next();

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
    iterator.return();
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

    const result = (await next).value;
    assert(result && !result.error);

    expect(result.value.value).toEqual(newValue);
    expect(result.value.actor).toEqual(session.actor);
    expect(result.value.channels).toEqual([]);
    expect(result.value.tombstone).toBe(false);
    expect(result.value.lastModified).toEqual(putted2.lastModified);
    expect(result.value.allowed).toBeUndefined();

    // Delete the object
    const deleted = await graffiti.delete(putted2, session);
    const result2 = (await iterator.next()).value;
    assert(result2 && !result2.error);
    expect(result2.value.tombstone).toBe(true);
    expect(result2.value.lastModified).toEqual(deleted.lastModified);

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
    const result1 = (await next1).value;
    const result2 = (await next2).value;
    assert(result1 && !result1.error);
    assert(result2 && !result2.error);

    expect(result1.value.value).toEqual(newValue);
    expect(result2.value.value).toEqual(object.value);
    expect(result1.value.actor).toEqual(session1.actor);
    expect(result2.value.actor).toEqual(session1.actor);
    expect(result1.value.channels).toEqual(object.channels);
    expect(result2.value.channels).toEqual([]);
    expect(result1.value.tombstone).toBe(false);
    expect(result2.value.tombstone).toBe(true);
    expect(result1.value.lastModified).toEqual(putted2.lastModified);
    expect(result2.value.lastModified).toEqual(putted2.lastModified);
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

    const iterator = graffiti.synchronizeAll();

    const next1 = iterator.next();
    const next2 = iterator.next();

    await graffiti.put<{}>(object1, session1);
    await graffiti.put<{}>(object2, session2);

    const result1 = (await next1).value;
    const result2 = (await next2).value;
    assert(result1 && !result1.error);
    assert(result2 && !result2.error);

    expect(result1.value.value).toEqual(object1.value);
    expect(result1.value.channels).toEqual([]);
    expect(result2.value.value).toEqual(object2.value);
  });

  it("omniscient", async () => {
    const graffiti = new GraffitiSynchronize(new GraffitiLocal(), {
      omniscient: true,
    });

    const object1 = randomPutObject();
    object1.allowed = [randomString()];

    const iterator = graffiti.synchronizeAll();
    const next = iterator.next();

    await graffiti.put<{}>(object1, session1);

    const result = (await next).value;
    assert(result && !result.error);
    expect(result.value.value).toEqual(object1.value);
    expect(result.value.channels).toEqual(object1.channels);
    expect(result.value.allowed).toEqual(object1.allowed);
  });
});
