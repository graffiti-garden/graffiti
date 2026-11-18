import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GraffitiErrorCursorExpired,
  GraffitiErrorNotFound,
} from "@graffiti-garden/api";
import { localGraffiti } from "../test/graffiti-local.js";
import { GraffitiRelay, PROTOCOL } from "./signaling.js";

const session = { actor: "did:example:alice" };

describe("Graffiti signaling", () => {
  const relays: GraffitiRelay[] = [];
  const databases: Awaited<ReturnType<typeof localGraffiti>>[] = [];
  afterEach(async () => {
    await Promise.all(relays.splice(0).map((relay) => relay.close()));
    await Promise.all(
      databases.splice(0).map((database) => database.dispose()),
    );
  });

  async function setup() {
    const database = await localGraffiti();
    databases.push(database);
    const { graffiti } = database;
    const report = vi.fn();
    const relay = new GraffitiRelay(graffiti, session, report);
    relays.push(relay);
    return { relay, graffiti, report };
  }

  it("ignores expired/unrelated records and delivers valid signals", async () => {
    const { relay, graffiti, report } = await setup();
    const receive = vi.fn();
    await graffiti.post(
      {
        value: {
          protocol: PROTOCOL,
          payload: "stale",
          expires: Date.now() - 1,
        },
        channels: ["realtime:root"],
      },
      session,
    );
    await graffiti.post(
      { value: { unrelated: true }, channels: ["realtime:root"] },
      session,
    );
    relay.subscribe("root", receive);
    await relay.publish("root", { peerId: "other" });
    await vi.waitFor(
      () =>
        expect(receive).toHaveBeenCalledExactlyOnceWith("root", {
          peerId: "other",
        }),
      { timeout: 4000 },
    );
    expect(report).not.toHaveBeenCalled();
  });

  it("resumes discovery after cursor expiry", async () => {
    const { relay, graffiti, report } = await setup();
    const receive = vi.fn();
    await relay.publish("root", "presence");
    relay.subscribe("root", receive);
    await vi.waitFor(() =>
      expect(receive).toHaveBeenCalledWith("root", "presence"),
    );
    receive.mockClear();
    graffiti.continueDiscover = async function* () {
      throw new GraffitiErrorCursorExpired();
    };
    await vi.waitFor(
      () => expect(receive).toHaveBeenCalledWith("root", "presence"),
      { timeout: 4000 },
    );
    expect(report).not.toHaveBeenCalled();
  });

  it("continues past an individual provider error", async () => {
    const { relay, graffiti, report } = await setup();
    const receive = vi.fn();
    const error = new Error("One provider is unavailable");
    const discover = graffiti.discover.bind(graffiti);
    graffiti.discover = async function* (
      ...args: Parameters<typeof graffiti.discover>
    ) {
      yield { error, origin: "https://offline.example" };
      return yield* discover<{}>(...args);
    } as typeof graffiti.discover;
    await relay.publish("root", "available elsewhere");
    relay.subscribe("root", receive);
    await vi.waitFor(() =>
      expect(receive).toHaveBeenCalledWith("root", "available elsewhere"),
    );
    expect(report).toHaveBeenCalledWith(error);
  });

  it("retries when starting discovery fails", async () => {
    const { relay, graffiti, report } = await setup();
    const receive = vi.fn();
    const error = new Error("Network unavailable");
    const discover = graffiti.discover;
    graffiti.discover = () => {
      graffiti.discover = discover;
      throw error;
    };
    await relay.publish("root", "recovered");
    relay.subscribe("root", receive);
    await vi.waitFor(
      () => expect(receive).toHaveBeenCalledWith("root", "recovered"),
      { timeout: 7000 },
    );
    expect(report).toHaveBeenCalledWith(error);
  });

  it("reports Graffiti write failures", async () => {
    const { relay, graffiti, report } = await setup();
    const error = new Error("Storage unavailable");
    vi.spyOn(graffiti, "post").mockRejectedValueOnce(error);
    await expect(relay.publish("root", "offer")).rejects.toBe(error);
    expect(report).toHaveBeenCalledWith(error);
  });

  it("expires signaling records while retaining identity until leave", async () => {
    const { relay, graffiti } = await setup();
    const signal = await relay.post(
      { payload: "offer" },
      ["realtime:root"],
      50,
    );
    const identity = await relay.post({ kind: "identity" }, []);
    await vi.waitFor(async () => {
      await expect(
        graffiti.get(signal.url, {}, session),
      ).rejects.toBeInstanceOf(GraffitiErrorNotFound);
    });
    expect(await graffiti.get(identity.url, {}, session)).toEqual(identity);
    await relay.close();
    await expect(
      graffiti.get(identity.url, {}, session),
    ).rejects.toBeInstanceOf(GraffitiErrorNotFound);
  });

  it("ignores late results and closes a discovery that was pending when leaving", async () => {
    const { relay, graffiti, report } = await setup();
    const receive = vi.fn();
    const object = await relay.post(
      { protocol: PROTOCOL, payload: "late", expires: Date.now() + 1000 },
      ["realtime:root"],
    );
    const pending = Promise.withResolvers<void>();
    const finished = Promise.withResolvers<void>();
    graffiti.discover = async function* () {
      try {
        await pending.promise;
        yield { object };
        return { cursor: "unused" };
      } finally {
        finished.resolve();
      }
    } as typeof graffiti.discover;
    relay.subscribe("root", receive);
    await relay.close();
    pending.resolve();
    await finished.promise;
    expect(receive).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });
});
