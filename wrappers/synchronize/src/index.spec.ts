import { it, expect, describe, assert, beforeAll } from "vitest";
import {
  GraffitiErrorNotFound,
  type GraffitiSession,
} from "@graffiti-garden/api";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import {
  randomPostObject,
  randomString,
  randomUrl,
} from "@graffiti-garden/api/tests";
import { GraffitiSynchronize } from "./index";
import {
  graffitiCRUDTests,
  graffitiDiscoverTests,
  graffitiMediaTests,
} from "@graffiti-garden/api/tests";

// @ts-ignore
const useGraffiti = () => new GraffitiSynchronize(new GraffitiLocal());
const graffiti = useGraffiti();

const useSession1 = async () => {
  return {
    actor: randomUrl(),
  };
};
const useSession2 = async () => {
  return {
    actor: randomUrl(),
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

    const object = randomPostObject();
    const channels = object.channels.slice(1);
    const posted = await graffiti1.post<{}>(object, session);

    const graffiti2 = useGraffiti();
    const next = graffiti2.synchronizeDiscover(channels, {}).next();
    const gotten = await graffiti2.get(posted, {}, session);

    const result = await next;
    if (result.done || result.value.error) {
      throw new Error("Error in synchronize");
    }
    assert(!result.value.tombstone);
    expect(result.value.object.value).toEqual(object.value);
    expect(result.value.object.channels).toEqual(channels);
  });

  it("delete", async () => {
    const channels = [randomString(), randomString(), randomString()];

    // Start listening for changes...
    const beforeIterator = graffiti.synchronizeDiscover(channels, {});
    // Skip the first result
    beforeIterator.next();

    const oldValue = { hello: "world" };
    const oldChannels = [randomString(), ...channels.slice(1)];
    const posted = await graffiti.post<{}>(
      {
        value: oldValue,
        channels: oldChannels,
      },
      session,
    );

    const beforeButAfter = graffiti.synchronizeDiscover(channels, {}).next();
    const next = beforeIterator.next();

    await graffiti.delete(posted, session);

    // If you just start synchronizing after the first post,
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
    expect(result.value.object.url).toEqual(posted.url);
  });

  it("get deletion in another instance", async () => {
    // Begin discovering and find nothing
    const object = randomPostObject();
    const posted = await graffiti.post<{}>(object, session);

    // Now sync a get
    const getIterator = graffiti.synchronizeGet(posted, {});
    const next = getIterator.next();

    // The sync will not pick up on it since it is not
    // actively listening
    await expect(
      Promise.race([
        next,
        new Promise((resolve, rejects) => setTimeout(rejects, 100, "Timeout")),
      ]),
    ).rejects.toThrow("Timeout");

    // Delete the object in another graffiti instance
    const graffiti2 = useGraffiti();
    await graffiti2.delete(posted, session);

    // Call get in the original instance
    await expect(graffiti.get(posted, {})).rejects.toThrow(
      GraffitiErrorNotFound,
    );

    // And then the sync will pick up on it from the continue
    const syncResult = await next;
    assert(!syncResult.done && !syncResult.value.error);
    expect(syncResult.value.tombstone).toBe(true);
    expect(syncResult.value.object.url).toEqual(posted.url);
  });

  it("synchronize happens before posters", async () => {
    const object = randomPostObject();
    const iterator = graffiti.synchronizeDiscover(object.channels, {});

    for (let i = 0; i < 10; i++) {
      const next = iterator.next();
      const posted = graffiti.post<{}>(object, session);

      let first: undefined | string = undefined;
      next.then(() => {
        if (!first) first = "synchronize";
      });
      posted.then(() => {
        if (!first) first = "post";
      });
      await posted;

      expect(first).toBe("synchronize");

      const deleted = graffiti.delete(await posted, session);
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
    iterator.return({ cursor: "" });
  });

  it("not allowed", async () => {
    const allChannels = [randomUrl(), randomUrl(), randomUrl()];
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
    const allowed = [randomUrl(), session2.actor];
    await graffiti.post<{}>(
      { value, channels: allChannels, allowed },
      session1,
    );

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

  it("delete", async () => {
    const object = randomPostObject();
    const posted = await graffiti.post<{}>(object, session);

    const iterator = graffiti.synchronizeGet(posted, {});
    const next = iterator.next();

    // Delete the object
    const deleted = await graffiti.delete(posted, session);
    const result2 = await next;
    assert(!result2.done && !result2.value.error);
    expect(result2.value.tombstone).toBe(true);
    expect(result2.value.object.url).toEqual(posted.url);
  });

  it("delete in different instance and discover", async () => {
    // Begin discovering and find nothing
    const object = randomPostObject();
    const discoverIterator = graffiti.discover(object.channels, {});
    const nullDiscoverResult = await discoverIterator.next();
    assert(nullDiscoverResult.done, "discover is not done");

    // Post to the channel
    const posted = await graffiti.post<{}>(object, session);

    // Now sync a get
    const getIterator = graffiti.synchronizeGet(posted, {});
    const next = getIterator.next();

    // Delete the object in another graffiti instance
    const graffiti2 = useGraffiti();
    await graffiti2.delete(posted, session);

    // The sync will not pick up on it since it is not
    // actively listening
    await expect(
      Promise.race([
        next,
        new Promise((resolve, rejects) => setTimeout(rejects, 100, "Timeout")),
      ]),
    ).rejects.toThrow("Timeout");

    // However, the continue will pick up on it
    const continueResult = await graffiti
      .continueDiscover(nullDiscoverResult.value.cursor)
      .next();
    assert(!continueResult.done && !continueResult.value.error);
    expect(continueResult.value.tombstone).toBe(true);
    expect(continueResult.value.object.url).toEqual(posted.url);

    // And then the sync will pick up on it from the continue
    const syncResult = await next;
    assert(!syncResult.done && !syncResult.value.error);
    expect(syncResult.value.tombstone).toBe(true);
    expect(syncResult.value.object.url).toEqual(posted.url);
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
    const object1 = randomPostObject();
    const object2 = randomPostObject();

    expect(object1.channels).not.toEqual(object2.channels);

    const iterator = graffiti.synchronizeAll({});

    const next1 = iterator.next();
    const next2 = iterator.next();

    await graffiti.post<{}>(object1, session1);
    await graffiti.post<{}>(object2, session2);

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

    const object1 = randomPostObject();
    object1.allowed = [randomUrl()];

    const iterator = graffiti.synchronizeAll({});
    const next = iterator.next();

    await graffiti.post<{}>(object1, session1);

    const result = await next;
    assert(!result.done && !result.value.error && !result.value.tombstone);
    expect(result.value.object.value).toEqual(object1.value);
    expect(result.value.object.channels).toEqual(object1.channels);
    expect(result.value.object.allowed).toEqual(object1.allowed);
  });
});

graffitiCRUDTests(useGraffiti, useSession1, useSession2);
graffitiDiscoverTests(useGraffiti, useSession1, useSession2);
graffitiMediaTests(useGraffiti, useSession1, useSession2);
