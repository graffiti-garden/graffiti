import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encode } from "@ipld/dag-cbor";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiLocalObjects } from "@graffiti-garden/implementation-local/objects";
import { GraffitiErrorCursorExpired, GraffitiErrorNotFound, type GraffitiObjectBase } from "@graffiti-garden/api";

const factory = vi.hoisted(() => vi.fn());
vi.mock("./signaling.js", async original => ({
  ...await original<typeof import("./signaling.js")>(), joinTransport: factory,
}));
import { GraffitiRealtime } from "./index.js";

type Handler = (...args: any[]) => any;
function transport() {
  let onJoin: Handler, onMessage: Handler, onReceive: Handler, onReady: Handler;
  const identity = { request: vi.fn(), onRequest: vi.fn() };
  const changes = { send: vi.fn(async (_data: string, _options: { target: string }) => {}),
    onMessage: (fn: Handler) => { onMessage = fn; }, onReceive: (fn: Handler) => { onReceive = fn; } };
  const media = { request: vi.fn(async () => null as Uint8Array | null), onRequest: vi.fn() };
  const ready = { send: vi.fn(async () => {}), onMessage: (fn: Handler) => { onReady = fn; } };
  return {
    identity, changes, media,
    makeAction: (name: string) => name === "identity" ? identity : name === "objects" ? changes : name === "ready" ? ready : media,
    getSelf: async () => ({ peerId: "self", userId: "self-key" }),
    onPeerJoin: (fn: Handler) => { onJoin = fn; },
    onPeerLeave: vi.fn(), onError: vi.fn(), leave: vi.fn(async () => {}),
    connect: () => {
      const connecting = onJoin({ peerId: "peer", userId: "key" });
      onReady(null, { peerId: "peer" });
      return connecting;
    },
    receive: async (change: unknown) => {
      if (await onReceive({ peerId: "peer" })) await onMessage(JSON.stringify(change), { peerId: "peer" });
    },
  };
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); factory.mockReset();
});

async function setup(active = true) {
  const directory = await mkdtemp(join(tmpdir(), "graffiti-realtime-peer-"));
  const options = { pouchDBOptions: { name: join(directory, "db") }, continueBuffer: 0 };
  const local = new GraffitiLocal(options);
  const raw = transport();
  factory.mockReturnValue(raw);
  vi.stubGlobal("RTCPeerConnection", class {});
  const graffiti = new GraffitiRealtime(local);
  const session = { actor: "did:example:alice" };
  const peer = { actor: "did:example:bob" };
  const initial = graffiti.discover(["game"], {}, session);
  const end = await initial.next();
  if (!end.done) throw new Error("Expected an empty initial discovery");
  const polling = active ? await graffiti.continueDiscover(end.value.cursor, session).next() : end;
  if (!polling.done) throw new Error("Expected an empty continuation");
  const binding = await local.post({ value: {
    protocol: "graffiti-wrapper-realtime/v1", peerId: "peer", userId: "key",
  }, channels: [] }, peer);
  raw.identity.request.mockResolvedValue(binding.url);
  if (active) await raw.connect();
  cleanups.push(async () => {
    await graffiti.close();
    await (await new GraffitiLocalObjects(options).db).destroy();
    await rm(directory, { recursive: true, force: true });
  });
  return { graffiti, local, raw, session, peer, binding, cursor: polling.value.cursor };
}

test("a new peer receives recent live writes without replaying persistent history", async () => {
  const { graffiti, local, raw, session } = await setup();
  const durable = await local.post({ value: { note: "persistent history" }, channels: ["game"] }, session);
  const live = await graffiti.post({ value: { x: 1 }, channels: ["game"] }, session);
  const discover = vi.spyOn(local, "discover");
  raw.changes.send.mockClear();
  raw.connect();
  await vi.waitFor(() => expect(raw.changes.send.mock.calls.some(([text]) =>
    JSON.parse(text).object.url === live.url)).toBe(true));
  expect(raw.changes.send.mock.calls.some(([text]) => JSON.parse(text).object.url === durable.url)).toBe(false);
  expect(discover).not.toHaveBeenCalled();
});

test("an already connected peer recovers from a failed identity lookup", async () => {
  const { graffiti, local, raw, session, peer } = await setup();
  const get = vi.spyOn(local, "get").mockRejectedValueOnce(new GraffitiErrorCursorExpired("Cache out of sync"));
  raw.connect();
  await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2), { timeout: 3000 });
  const object = { url: "test:after-recovery", actor: peer.actor, channels: ["game"], value: { x: 1 } };
  await raw.receive({ object });
  expect(await graffiti.get(object, {}, session)).toMatchObject({ value: { x: 1 } });
});

test("identity publication can be retried without keeping failed records", async () => {
  const { local, raw, session } = await setup();
  const failure = new Error("Storage temporarily unavailable");
  vi.spyOn(local, "flush").mockRejectedValueOnce(failure);
  const post = vi.spyOn(local, "post");
  const identity = raw.identity.onRequest.mock.calls[0][0];
  await expect(identity()).rejects.toBe(failure);
  const failed = await post.mock.results[0].value;
  await expect(local.get(failed, {}, session)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
  const url = await identity();
  expect(await local.get(url, {}, session)).toMatchObject({ actor: session.actor });
});

test("discovers authenticated live objects absent from storage and preserves deletions", async () => {
  const { graffiti, local, raw, session, peer, cursor } = await setup();
  const object: GraffitiObjectBase = {
    url: "test:live-position", actor: peer.actor, channels: ["game", "hidden"],
    allowed: [session.actor], value: { x: 12, y: 3 },
  };
  await raw.receive({ object });
  await expect(local.get(object.url, {}, session)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
  expect((await graffiti.get(object.url, {}, session)).channels).toEqual([]);
  const next = graffiti.continueDiscover(cursor, session);
  expect((await next.next()).value).toMatchObject({ object: { value: { x: 12 }, channels: ["game"] } });
  const end = await next.next();
  if (!end.done) throw new Error("Expected the next cursor");
  await raw.receive({ object, tombstone: true });
  await raw.receive({ object }); // A late initial snapshot must not revive it.
  await expect(graffiti.get(object.url, {}, session)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
  const deleted = graffiti.continueDiscover(end.value.cursor, session);
  expect((await deleted.next()).value).toMatchObject({ tombstone: true });
  await deleted.return({ cursor: "" });
});

test("rejects forged actors and sends only the peer's allowed and channel view", async () => {
  const { graffiti, raw, session, peer } = await setup();
  await raw.receive({ object: { url: "test:forged", actor: session.actor, channels: ["game"], value: {} } });
  await expect(graffiti.get("test:forged", {}, session)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
  const object = await graffiti.post({ value: { hello: true }, channels: ["game"], allowed: [peer.actor, "did:example:carol"] }, session);
  await vi.waitFor(() => expect(raw.changes.send).toHaveBeenCalled());
  const sent = raw.changes.send.mock.calls.map(call => JSON.parse(call[0] as string));
  expect(sent.find(change => change.object.url === object.url).object.allowed).toEqual([peer.actor]);
  raw.changes.send.mockClear();
  const secret = await graffiti.post({ value: { secret: true }, channels: ["game"], allowed: [] }, session);
  expect(raw.changes.send.mock.calls.some(([text]) => JSON.parse(text).object.url === secret.url)).toBe(false);
});

test("shares channel views without exposing unrequested channels", async () => {
  const { graffiti, raw, session, peer, binding } = await setup();
  const other = transport();
  factory.mockReturnValueOnce(other);
  for await (const _ of graffiti.discover(["other"], {}, session)) { /* Open the second channel. */ }
  for await (const _ of graffiti.discover(["other"], {}, session)) { /* Frequent reads activate it. */ }
  other.identity.request.mockResolvedValue(binding.url);
  await other.connect();
  const object = { url: "test:both-channels", actor: peer.actor, channels: ["game"], value: { x: 1 } };
  await raw.receive({ object });
  await other.receive({ object: { ...object, channels: ["other"] } });
  const one = [];
  for await (const result of graffiti.discover(["game"], {}, session)) one.push(result);
  expect(one).toEqual([{ object }]);
  const both = [];
  for await (const result of graffiti.discover(["game", "other"], {}, session)) both.push(result);
  expect(both).toEqual([{ object: { ...object, channels: ["game", "other"] } }]);
  await raw.receive({ object, tombstone: true });
  await expect(graffiti.get(object, {}, session)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
});

test("changing a returned object does not change the live cache", async () => {
  const { graffiti, session } = await setup();
  const object = await graffiti.post({ value: { x: 1 }, channels: ["game"] }, session);
  Object.assign(object.value, { x: 2 });
  expect((await graffiti.get(object, {}, session)).value).toEqual({ x: 1 });
});

test("live discovery advances while persistent discovery is waiting", async () => {
  const { graffiti, local, raw, session, peer, cursor } = await setup();
  const release = Promise.withResolvers<void>();
  vi.spyOn(local, "continueDiscover").mockImplementationOnce(async function* () {
    await release.promise;
    return { cursor: "next-storage-page" };
  });
  const stream = graffiti.continueDiscover(cursor, session);
  const next = stream.next();
  try {
    await raw.receive({ object: { url: "test:during-poll", actor: peer.actor, channels: ["game"], value: { x: 1 } } });
    await expect(next).resolves.toMatchObject({ value: { object: { url: "test:during-poll" } } });
    // Keep delivering live changes while this single storage request waits.
    for (let frame = 0; frame < 100; frame++) {
      const next = stream.next();
      await raw.receive({ object: { url: `test:waiting-${frame}`, actor: peer.actor, channels: ["game"], value: { frame } } });
      await expect(next).resolves.toMatchObject({ value: { object: { value: { frame } } } });
    }
    release.resolve();
    await expect(stream.next()).resolves.toMatchObject({ done: true, value: expect.objectContaining({ cursor: expect.any(String) }) });
  } finally { release.resolve(); await stream.return({ cursor: "" }); }
});

test("continuous polling needs no caller delay, even when storage returns immediately", async () => {
  const { graffiti, local, raw, session, peer, cursor } = await setup();
  const read = vi.spyOn(local, "continueDiscover");
  const object = { url: "test:unthrottled-poll", actor: peer.actor, channels: ["game"], value: { x: 1 } };
  await raw.receive({ object });
  let nextCursor = cursor, polls = 0, received = false;
  const until = Date.now() + 250;
  // The cap also makes a regression fail instead of starving the test runner.
  while (Date.now() < until && polls < 100) {
    const stream = graffiti.continueDiscover(nextCursor, { session, refresh: true });
    while (true) {
      const next = await stream.next();
      if (next.done) { nextCursor = next.value.cursor; break; }
      if (!next.value.error && next.value.object.url === object.url) received = true;
    }
    polls++;
  }
  expect(received).toBe(true);
  expect(read).toHaveBeenCalledTimes(polls);
  expect(polls).toBeLessThanOrEqual(10);
});

test("a deletion learned from storage invalidates the live cache", async () => {
  const { graffiti, local, raw, session, peer, cursor } = await setup();
  const object = await local.post({ value: { x: 1 }, channels: ["game"] }, peer);
  await raw.receive({ object });
  await local.delete(object, peer);
  for await (const result of graffiti.continueDiscover(cursor, session)) {
    if (result.error) throw result.error;
  }
  await raw.receive({ object });
  await expect(graffiti.get(object.url, {}, session)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
});

test("an explicit refresh checks storage despite an ephemeral tombstone", async () => {
  const { graffiti, local, raw, session, peer } = await setup();
  const object = await local.post({ value: { x: 1 }, channels: ["game"] }, peer);
  await raw.receive({ object, tombstone: true });
  await expect(graffiti.get(object, {}, session)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
  expect(await graffiti.get(object, {}, { session, refresh: true })).toMatchObject({ value: { x: 1 } });
});

test("retrieves Blob bytes over the existing authenticated connection", async () => {
  const { graffiti, raw, session, peer } = await setup();
  raw.media.request.mockResolvedValue(encode({ data: new TextEncoder().encode("hello"), type: "text/plain", allowed: [session.actor] }));
  const media = await graffiti.getMedia("test:live-blob", { types: ["text/*"], maxBytes: 5 }, session);
  expect(media.actor).toBe(peer.actor);
  expect(media.data.type).toBe("text/plain");
  expect(await media.data.text()).toBe("hello");
});

test("one-off and infrequent discovery keep storage cursors without opening rooms", async () => {
  const { graffiti, local, session, cursor } = await setup(false);
  expect(factory).not.toHaveBeenCalled();
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
  const object = await local.post({ value: { note: "durable" }, channels: ["game"] }, session);
  const entries = [];
  for await (const entry of graffiti.continueDiscover(cursor, session)) entries.push(entry);
  expect(entries).toEqual([{ object }]);
  expect(factory).not.toHaveBeenCalled();
});

test("live cursors and objects expire, and idle rooms close", async () => {
  const { graffiti, raw, session, peer, cursor } = await setup();
  const object = { url: "test:temporary", actor: peer.actor, channels: ["game"], value: { x: 1 } };
  await raw.receive({ object });
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 6000);
  await expect(graffiti.continueDiscover(cursor, session).next()).rejects.toBeInstanceOf(GraffitiErrorCursorExpired);
  await expect(graffiti.get(object, {}, session)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
  for await (const _ of graffiti.discover(["game"], {}, session)) { /* A new ordinary read. */ }
  expect(raw.leave).toHaveBeenCalledOnce();
  expect(factory).toHaveBeenCalledOnce();
});

test("a burst cannot retain an unbounded live history", async () => {
  const { graffiti, raw, session, peer, cursor } = await setup();
  vi.spyOn(Date, "now").mockReturnValue(Date.now());
  for (let frame = 0; frame < 2500; frame++) {
    const object = { url: `test:frame-${frame}`, actor: peer.actor, channels: ["game"], value: { frame } };
    await raw.receive({ object });
    await raw.receive({ object, tombstone: true });
  }
  await expect(graffiti.continueDiscover(cursor, session).next()).rejects.toBeInstanceOf(GraffitiErrorCursorExpired);
  // Looking up a forgotten tombstone falls through to storage instead of
  // retaining its payload indefinitely merely to remember that it was deleted.
  const account = [...(graffiti as any).accounts.values()][0];
  expect(account.entries.size).toBeLessThanOrEqual(1024);
  expect(account.entries.has("test:frame-0")).toBe(false);
});

test("a slow peer does not queue every live update", async () => {
  const { graffiti, raw, session, peer } = await setup();
  await raw.receive({ object: { url: "test:ready", actor: peer.actor, channels: ["game"], value: {} } });
  const release = Promise.withResolvers<void>();
  raw.changes.send.mockImplementationOnce(() => release.promise);
  try {
    for (let frame = 0; frame < 50; frame++) await graffiti.post({ value: { frame }, channels: ["game"] }, session);
    expect(raw.changes.send).toHaveBeenCalledTimes(1);
  } finally { release.resolve(); }
  await vi.waitFor(async () => {
    await graffiti.post({ value: { latest: true }, channels: ["game"] }, session);
    expect(raw.changes.send.mock.calls.some(([text]) => JSON.parse(text).object.value.latest)).toBe(true);
  });
});
