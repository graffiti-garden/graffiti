import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  GraffitiErrorInvalidSchema,
  GraffitiErrorNotFound,
  type GraffitiObjectBase,
  type JSONSchema,
} from "@graffiti-garden/api";
import { localGraffiti } from "../test/graffiti-local.js";

const transportFactory = vi.hoisted(() => vi.fn());
vi.mock("./signaling.js", async (original) => ({
  ...(await original<typeof import("./signaling.js")>()),
  joinTransport: transportFactory,
}));
import { GraffitiRealtime, type RealtimeValue } from "./index.js";

type Context = { peerId: string; userId: string; roles: string[] };
type Handler = (...args: any[]) => any;

// Control transport timing and identity failures; browser tests use real Trystero.
function fakeTransport() {
  const listeners = new Map<string, Set<Handler>>();
  function subscribe(
    name: string,
    handler: Handler,
    options?: { signal?: AbortSignal },
  ) {
    const callbacks = listeners.get(name) ?? new Set<Handler>();
    listeners.set(name, callbacks);
    const unsubscribe = () => {
      callbacks.delete(handler);
      options?.signal?.removeEventListener("abort", unsubscribe);
    };
    if (!options?.signal?.aborted) {
      callbacks.add(handler);
      options?.signal?.addEventListener("abort", unsubscribe, { once: true });
    }
    return unsubscribe;
  }
  function emit(name: string, ...args: any[]) {
    return Promise.all(
      [...(listeners.get(name) ?? [])].map((handler) => handler(...args)),
    );
  }
  const proofs = new Map<
    string,
    ReturnType<typeof Promise.withResolvers<string>>
  >();
  let gate: Handler, respond: Handler;
  const data = {
    send: vi.fn(async () => {}),
    onReceive: (fn: Handler) => {
      gate = fn;
    },
    onMessage: (fn: Handler, options?: { signal?: AbortSignal }) =>
      subscribe("message", fn, options),
  };
  const identity = {
    request: async (_: null, { target }: { target: string }) =>
      proofs.get(target)!.promise,
    onRequest: (fn: Handler) => {
      respond = fn;
    },
  };
  const transport = {
    getSelf: async () => ({ peerId: "local-peer", userId: "local-key" }),
    makeAction: (name: string) => (name === "identity" ? identity : data),
    onPeerJoin: (fn: Handler, options?: { signal?: AbortSignal }) =>
      subscribe("join", fn, options),
    onPeerLeave: (fn: Handler, options?: { signal?: AbortSignal }) =>
      subscribe("leave", fn, options),
    onPeerStream: (fn: Handler, options?: { signal?: AbortSignal }) =>
      subscribe("stream", fn, options),
    onError: (fn: Handler, options?: { signal?: AbortSignal }) =>
      subscribe("error", fn, options),
    addStream: vi.fn(async () => {}),
    removeStream: vi.fn(),
    leave: vi.fn(async () => {
      listeners.clear();
    }),
  };
  return {
    transport,
    emit,
    data,
    proofs,
    connect(peerId = "remote", userId = "remote-key") {
      const context = { peerId, userId, roles: [] };
      proofs.set(peerId, Promise.withResolvers());
      void emit("join", context);
      return context;
    },
    async message(message: unknown, context: Context) {
      if (await gate(context)) {
        return emit("message", message, context);
      }
    },
    ownProof: () => respond() as Promise<string>,
  };
}

describe("GraffitiRealtime", () => {
  const rooms: GraffitiRealtime[] = [];
  const databases: Awaited<ReturnType<typeof localGraffiti>>[] = [];
  afterEach(async () => {
    await Promise.all(rooms.splice(0).map((room) => room.leave()));
    await Promise.all(
      databases.splice(0).map((database) => database.dispose()),
    );
  });

  async function setup() {
    const raw = fakeTransport();
    transportFactory.mockReturnValueOnce(raw.transport);
    const database = await localGraffiti();
    databases.push(database);
    const { graffiti } = database;
    const session = { actor: "did:example:alice" };
    const room = new GraffitiRealtime(graffiti, crypto.randomUUID(), session);
    rooms.push(room);
    const errors = vi.fn();
    room.onError(errors);
    await room.getSelf();
    const ownBinding = await graffiti.get(await raw.ownProof(), {}, session);
    async function prove(
      context: Context,
      overrides = {},
      actor = "did:example:bob",
    ) {
      const binding = await graffiti.post(
        {
          value: {
            ...ownBinding.value,
            peerId: context.peerId,
            userId: context.userId,
            ...overrides,
          },
          channels: [],
        },
        { actor },
      );
      raw.proofs.get(context.peerId)!.resolve(binding.url);
      return binding;
    }
    return { raw, graffiti, session, room, errors, ownBinding, prove };
  }

  it("filters duck-typed values and authenticated actors, with schema-inferred types", async () => {
    const { room, raw, prove, session } = await setup();
    expect(await room.getSelf()).toEqual({
      actor: session.actor,
      peerId: "local-peer",
    });
    const received = vi.fn();
    const schema = {
      properties: {
        actor: { const: "did:example:bob" },
        value: {
          properties: {
            x: { type: "number" },
            y: { type: "number" },
            z: { type: "number" },
          },
          required: ["x", "y", "z"],
        },
      },
    } as const satisfies JSONSchema;
    room.onMessage(schema, (message) => {
      expectTypeOf(message.value.x).toEqualTypeOf<number>();
      expectTypeOf(message.actor).toEqualTypeOf<"did:example:bob">();
      expectTypeOf(message.peerId).toEqualTypeOf<string>();
      received(message);
    });
    const bob = raw.connect();
    const other = raw.connect("other", "other-key");
    await prove(bob);
    await prove(other, {}, "did:example:other");
    await raw.message({ x: 1, y: 2 }, bob);
    await raw.message({ x: "1", y: 2, z: 3 }, bob);
    await raw.message({ x: 1, y: 2, z: 3, actor: "did:example:bob" }, other);
    await raw.message({ x: 1, y: 2, z: 3 }, bob);
    expect(received).toHaveBeenCalledExactlyOnceWith({
      value: { x: 1, y: 2, z: 3 },
      actor: "did:example:bob",
      peerId: bob.peerId,
    });
  });

  it("filters stream metadata by schema and actor", async () => {
    const { room, raw, prove } = await setup();
    const received = vi.fn();
    room.onStream(
      {
        properties: {
          actor: { const: "did:example:bob" },
          value: {
            properties: { source: { enum: ["camera", "screen"] } },
            required: ["source"],
          },
        },
      } as const satisfies JSONSchema,
      (stream, message) => {
        expectTypeOf(stream).toEqualTypeOf<MediaStream>();
        expectTypeOf(message.value.source).toEqualTypeOf<"camera" | "screen">();
        received(stream, message);
      },
    );
    const bob = raw.connect();
    const other = raw.connect("other", "other-key");
    await prove(bob);
    await prove(other, {}, "did:example:other");
    const stream = { id: "camera" } as MediaStream;
    await raw.emit("stream", stream, bob);
    await raw.emit("stream", stream, { ...bob, metadata: { source: "audio" } });
    await raw.emit("stream", stream, {
      ...other,
      metadata: { source: "camera" },
    });
    await raw.emit("stream", stream, {
      ...bob,
      metadata: { source: "camera" },
    });
    expect(received).toHaveBeenCalledExactlyOnceWith(stream, {
      value: { source: "camera" },
      actor: "did:example:bob",
      peerId: bob.peerId,
    });
  });

  it("requires object values and metadata even for an empty subscription schema", async () => {
    const { room, raw, prove } = await setup();
    const message = vi.fn(),
      media = vi.fn();
    room.onMessage({}, message);
    room.onStream({}, media);
    const remote = raw.connect();
    await prove(remote);
    const stream = { id: "camera" } as MediaStream;
    for (const invalid of [null, "text", 1, [], new Uint8Array(2)]) {
      await expect(
        room.send(invalid as unknown as RealtimeValue),
      ).rejects.toBeInstanceOf(TypeError);
      await expect(
        room.addStream(stream, invalid as unknown as RealtimeValue),
      ).rejects.toBeInstanceOf(TypeError);
      await raw.message(invalid, remote);
      await raw.emit("stream", stream, {
        ...remote,
        metadata: invalid,
      });
    }
    await raw.message({}, remote);
    await raw.emit("stream", stream, remote);
    expect(media).toHaveBeenCalledExactlyOnceWith(stream, {
      value: {},
      actor: "did:example:bob",
      peerId: remote.peerId,
    });
    expect(message).toHaveBeenCalledExactlyOnceWith({
      value: {},
      actor: "did:example:bob",
      peerId: remote.peerId,
    });
  });

  it("reports connection and schema errors through independent subscriptions", async () => {
    const { room, raw, errors } = await setup();
    const extra = vi.fn();
    const unsubscribe = room.onError(extra);
    const connectionError = { message: "connection failed" };
    await raw.emit("error", connectionError);
    expect(errors).toHaveBeenCalledOnce();
    expect(errors.mock.calls[0][0].cause).toBe(connectionError);
    expect(extra).toHaveBeenCalledOnce();
    unsubscribe();
    room.onMessage({ type: "invalid" } as unknown as JSONSchema, vi.fn());
    await vi.waitFor(() => expect(errors).toHaveBeenCalledTimes(2));
    expect(errors.mock.calls[1][0]).toBeInstanceOf(GraffitiErrorInvalidSchema);
    expect(extra).toHaveBeenCalledOnce();
  });

  it("cancels delivery when unsubscribing while schema validation is queued", async () => {
    const { room, raw, prove } = await setup();
    const received = vi.fn(),
      joined = vi.fn();
    room.onPeerJoin(joined);
    const remote = raw.connect();
    await prove(remote);
    await vi.waitFor(() => expect(joined).toHaveBeenCalledOnce());
    const unsubscribe = room.onMessage({}, received);
    const next = vi.fn();
    room.onMessage({}, next);
    const pending = raw.emit("message", { x: 1 }, remote);
    unsubscribe();
    await pending;
    await raw.message({ x: 2 }, remote);
    expect(next).toHaveBeenCalledTimes(2);
    expect(received).not.toHaveBeenCalled();
  });

  it("cancels pending join and stream callbacks independently during verification", async () => {
    const { room, raw, prove } = await setup();
    const joined = vi.fn(),
      streamed = vi.fn(),
      remaining = vi.fn();
    const stopJoin = room.onPeerJoin(joined);
    const stopStream = room.onStream({}, streamed);
    room.onStream({}, remaining);
    const remote = raw.connect();
    const stream = { id: "camera" } as MediaStream;
    const pending = raw.emit("stream", stream, remote);
    stopJoin();
    stopStream();
    await prove(remote);
    await pending;
    expect(joined).not.toHaveBeenCalled();
    expect(streamed).not.toHaveBeenCalled();
    expect(remaining).toHaveBeenCalledExactlyOnceWith(stream, {
      value: {},
      actor: "did:example:bob",
      peerId: remote.peerId,
    });
  });

  it("verifies incoming messages and media while broadcasting without an actor allowlist", async () => {
    const { room, raw, prove } = await setup();
    const join = vi.fn(),
      message = vi.fn(),
      media = vi.fn();
    room.onPeerJoin(join);
    room.onMessage({}, message);
    room.onStream({}, media);
    const remote = raw.connect();
    const received = raw.message({ actor: "claimed-actor" }, remote);
    const stream = { id: "camera" } as MediaStream;
    const streamed = raw.emit("stream", stream, remote);
    await room.send({ text: "early" });
    expect(raw.data.send).toHaveBeenLastCalledWith({ text: "early" });
    expect(join).not.toHaveBeenCalled();
    expect(message).not.toHaveBeenCalled();
    expect(media).not.toHaveBeenCalled();
    await prove(remote);
    await Promise.all([received, streamed]);
    const peer = { actor: "did:example:bob", peerId: remote.peerId };
    expect(join).toHaveBeenCalledExactlyOnceWith(peer);
    expect(message).toHaveBeenCalledWith({
      value: { actor: "claimed-actor" },
      ...peer,
    });
    expect(media).toHaveBeenCalledWith(stream, { value: {}, ...peer });
  });

  it.each([{ peerId: "victim-peer" }, { userId: "victim-key" }])(
    "rejects a copied binding with mismatched IDs: %o",
    async (overrides) => {
      const { room, raw, prove, errors } = await setup();
      const join = vi.fn(),
        message = vi.fn();
      room.onPeerJoin(join);
      room.onMessage({}, message);
      const attacker = raw.connect("attacker", "attacker-key");
      await prove(attacker, overrides);
      await vi.waitFor(() => expect(errors).toHaveBeenCalled());
      await raw.message({ text: "spoofed" }, attacker);
      expect(join).not.toHaveBeenCalled();
      expect(message).not.toHaveBeenCalled();
    },
  );

  it("reports a failed identity request without admitting the peer", async () => {
    const { room, raw, errors } = await setup();
    const join = vi.fn();
    room.onPeerJoin(join);
    const peer = raw.connect();
    raw.proofs.get(peer.peerId)!.reject(new Error("request timed out"));
    await vi.waitFor(() => expect(errors).toHaveBeenCalled());
    expect(join).not.toHaveBeenCalled();
  });

  it("stops sharing a removed stream with future peers", async () => {
    const { room, raw, prove } = await setup();
    const joins = vi.fn();
    room.onPeerJoin(joins);
    const stream = { id: "camera" } as MediaStream;
    await room.addStream(stream);
    await room.removeStream(stream);
    raw.transport.addStream.mockClear();
    await prove(raw.connect());
    await vi.waitFor(() => expect(joins).toHaveBeenCalledOnce());
    expect(raw.transport.addStream).not.toHaveBeenCalled();
  });

  it("does not deliver events if verification finishes after peer departure", async () => {
    const { room, raw, prove } = await setup();
    const join = vi.fn(),
      message = vi.fn(),
      media = vi.fn(),
      leave = vi.fn();
    room.onPeerJoin(join);
    room.onMessage({}, message);
    room.onStream({}, media);
    room.onPeerLeave(leave);
    const remote = raw.connect();
    const received = raw.message({ text: "late" }, remote);
    const streamed = raw.emit(
      "stream",
      { id: "camera" } as MediaStream,
      remote,
    );
    await raw.emit("leave", remote);
    await prove(remote);
    await Promise.all([received, streamed]);
    expect(join).not.toHaveBeenCalled();
    expect(message).not.toHaveBeenCalled();
    expect(media).not.toHaveBeenCalled();
    expect(leave).not.toHaveBeenCalled();
  });

  it("unsubscribes and leaves without stopping caller-owned tracks", async () => {
    const { room, raw, prove, graffiti, ownBinding, session } = await setup();
    const stop = vi.fn();
    await room.addStream({
      getTracks: () => [{ stop }],
    } as unknown as MediaStream);
    const join = vi.fn(),
      message = vi.fn();
    room.onPeerJoin(join)();
    room.onMessage({}, message)();
    const remote = raw.connect();
    await prove(remote);
    await raw.message({ text: "hello" }, remote);
    await room.leave();
    expect(join).not.toHaveBeenCalled();
    expect(message).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
    await expect(
      graffiti.get(ownBinding.url, {}, session),
    ).rejects.toBeInstanceOf(GraffitiErrorNotFound);
    await expect(room.send({ text: "late" })).rejects.toThrow("left");
  });

  it("notifies verified departures once, including when leaving the room", async () => {
    const { room, raw, prove } = await setup();
    const left = vi.fn(),
      removed = vi.fn();
    room.onPeerLeave(left);
    room.onPeerLeave(removed)();
    const departed = raw.connect("departed"),
      remaining = raw.connect("remaining");
    for (const peer of [departed, remaining]) {
      await prove(peer);
      await raw.message({}, peer);
    }
    await raw.emit("leave", departed);
    await raw.emit("leave", departed);
    expect(left).toHaveBeenCalledExactlyOnceWith({
      actor: "did:example:bob",
      peerId: departed.peerId,
    });
    const leaving = room.leave();
    expect(room.leave()).toBe(leaving);
    await leaving;
    expect(left).toHaveBeenCalledTimes(2);
    expect(left).toHaveBeenLastCalledWith({
      actor: "did:example:bob",
      peerId: remaining.peerId,
    });
    expect(removed).not.toHaveBeenCalled();
  });

  it("cleans up an identity write that finishes after leaving", async () => {
    const raw = fakeTransport();
    transportFactory.mockReturnValueOnce(raw.transport);
    const database = await localGraffiti();
    databases.push(database);
    const { graffiti } = database;
    const pending = Promise.withResolvers<GraffitiObjectBase>();
    const post = graffiti.post.bind(graffiti);
    const delayed = vi
      .spyOn(graffiti, "post")
      .mockImplementation(() => pending.promise);
    const session = { actor: "did:example:alice" };
    const room = new GraffitiRealtime(graffiti, "channel", session);
    rooms.push(room);
    await vi.waitFor(() => expect(delayed).toHaveBeenCalled());
    await room.leave();
    const binding = await post(...delayed.mock.calls[0]);
    pending.resolve(binding);
    await expect(room.getSelf()).rejects.toThrow("left");
    await expect(graffiti.get(binding.url, {}, session)).rejects.toBeInstanceOf(
      GraffitiErrorNotFound,
    );
  });
});
