import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encode } from "@ipld/dag-cbor";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiLocalObjects } from "@graffiti-garden/implementation-local/objects";
import { GraffitiErrorNotFound, type GraffitiObjectBase } from "@graffiti-garden/api";

const factory = vi.hoisted(() => vi.fn());
vi.mock("@graffiti-garden/realtime/signaling", async original => ({
  ...await original<typeof import("@graffiti-garden/realtime/signaling")>(), joinTransport: factory,
}));
import { GraffitiRealtime } from "./index.js";

type Handler = (...args: any[]) => any;
function transport() {
  let onJoin: Handler, onMessage: Handler;
  const identity = { request: vi.fn(), onRequest: vi.fn() };
  const changes = { send: vi.fn(async (_data: string, _options: { target: string }) => {}), onMessage: (fn: Handler) => { onMessage = fn; } };
  const media = { request: vi.fn(async () => null as Uint8Array | null), onRequest: vi.fn() };
  return {
    identity, changes, media,
    makeAction: (name: string) => name === "identity" ? identity : name === "objects" ? changes : media,
    getSelf: async () => ({ peerId: "self", userId: "self-key" }),
    onPeerJoin: (fn: Handler) => { onJoin = fn; },
    onPeerLeave: vi.fn(), onError: vi.fn(), leave: vi.fn(async () => {}),
    connect: () => onJoin({ peerId: "peer", userId: "key" }),
    receive: (change: unknown) => onMessage(JSON.stringify(change), { peerId: "peer" }),
  };
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); factory.mockReset();
});

async function setup() {
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
  const binding = await local.post({ value: {
    protocol: "graffiti-implementation-realtime/v1", peerId: "peer", userId: "key",
  }, channels: [] }, peer);
  raw.identity.request.mockResolvedValue(binding.url);
  raw.connect();
  cleanups.push(async () => {
    await graffiti.close();
    await (await new GraffitiLocalObjects(options).db).destroy();
    await rm(directory, { recursive: true, force: true });
  });
  return { graffiti, local, raw, session, peer, cursor: end.value.cursor };
}

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
  } finally { release.resolve(); await stream.return({ cursor: "" }); }
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

test("retrieves Blob bytes over the existing authenticated connection", async () => {
  const { graffiti, raw, session, peer } = await setup();
  raw.media.request.mockResolvedValue(encode({ data: new TextEncoder().encode("hello"), type: "text/plain", allowed: [session.actor] }));
  const media = await graffiti.getMedia("test:live-blob", { types: ["text/*"], maxBytes: 5 }, session);
  expect(media.actor).toBe(peer.actor);
  expect(media.data.type).toBe("text/plain");
  expect(await media.data.text()).toBe("hello");
});
