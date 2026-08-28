import type { Graffiti } from "@graffiti-garden/api";
import { describe, expect, it, vi } from "vitest";
import {
  GraffitiMediaAcceptSchema,
  GraffitiMediaSchema,
  GraffitiObjectSchema,
  GraffitiObjectUrlSchema,
  GraffitiOptionalSessionSchema,
  GraffitiPostMediaSchema,
  GraffitiPostObjectSchema,
  GraffitiRuntimeTypes,
  GraffitiSessionSchema,
} from "../src/index.js";

const actor = "https://example.com/actors/alice";
const objectUrl = "https://example.com/objects/1";
const mediaUrl = "https://example.com/media/1";
const session = { actor, token: "implementation-specific" };
const schema = { type: "object" } as const;

function createSubject() {
  const sessionEvents = new EventTarget();
  const blob = new Blob(["hello"], { type: "text/plain" });
  const object = {
    value: { message: "hello" },
    channels: ["posts"],
    url: objectUrl,
    actor,
  };
  const media = { data: blob, actor };

  async function* stream() {
    return { cursor: "cursor" };
  }

  const discoverStream = stream();
  const continueStream = stream();
  const methods = {
    sessionEvents,
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    handleToActor: vi.fn().mockResolvedValue(actor),
    actorToHandle: vi.fn().mockResolvedValue("alice.example"),
    post: vi.fn().mockResolvedValue(object),
    get: vi.fn().mockResolvedValue(object),
    delete: vi.fn().mockResolvedValue(object),
    postMedia: vi.fn().mockResolvedValue(mediaUrl),
    getMedia: vi.fn().mockResolvedValue(media),
    deleteMedia: vi.fn().mockResolvedValue(undefined),
    discover: vi.fn().mockReturnValue(discoverStream),
    continueDiscover: vi.fn().mockReturnValue(continueStream),
  };

  return {
    methods,
    wrapper: new GraffitiRuntimeTypes(methods as unknown as Graffiti),
    results: { object, media, discoverStream, continueStream },
  };
}

describe("GraffitiRuntimeTypes", () => {
  it("validates every method's arguments before delegation", () => {
    const { methods, wrapper } = createSubject();
    const cases: Array<
      [
        keyof typeof methods,
        ReturnType<typeof vi.fn>,
        unknown[],
      ]
    > = [
      ["login", methods.login, ["not a URL"]],
      ["logout", methods.logout, [{}]],
      ["handleToActor", methods.handleToActor, [42]],
      ["actorToHandle", methods.actorToHandle, ["not a URL"]],
      [
        "post",
        methods.post,
        [{ value: {}, channels: [42] }, session],
      ],
      ["get", methods.get, ["not a URL", schema, session]],
      ["delete", methods.delete, [objectUrl, {}]],
      [
        "postMedia",
        methods.postMedia,
        [{ data: "not a Blob" }, session],
      ],
      ["getMedia", methods.getMedia, [mediaUrl, { maxBytes: -1 }, session]],
      ["deleteMedia", methods.deleteMedia, ["not a URL", session]],
      ["discover", methods.discover, [[42], schema, session]],
      ["continueDiscover", methods.continueDiscover, [42, session]],
    ];
    const callableWrapper = wrapper as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;

    for (const [method, delegate, args] of cases) {
      expect(() => callableWrapper[method](...args), method).toThrow();
      expect(delegate, method).not.toHaveBeenCalled();
    }
  });

  it("delegates valid arguments and returns successful results unchanged", async () => {
    const { methods, wrapper, results } = createSubject();
    const postObject = {
      value: { message: "hello" },
      channels: ["posts"],
      allowed: [actor],
    };
    const blob = new Blob(["hello"], { type: "text/plain" });
    const postMedia = { data: blob, allowed: [actor] };
    const accept = { types: ["text/plain"], maxBytes: 100 };

    await expect(wrapper.login(actor)).resolves.toBeUndefined();
    await expect(wrapper.logout(session)).resolves.toBeUndefined();
    await expect(wrapper.handleToActor("alice.example")).resolves.toBe(actor);
    await expect(wrapper.actorToHandle(actor)).resolves.toBe("alice.example");
    await expect(wrapper.post<{}>(postObject, session)).resolves.toBe(
      results.object,
    );
    await expect(wrapper.get(objectUrl, schema, session)).resolves.toBe(
      results.object,
    );
    await expect(wrapper.delete({ url: objectUrl }, session)).resolves.toBe(
      results.object,
    );
    await expect(wrapper.postMedia(postMedia, session)).resolves.toBe(mediaUrl);
    await expect(wrapper.getMedia(mediaUrl, accept, session)).resolves.toBe(
      results.media,
    );
    await expect(wrapper.deleteMedia(mediaUrl, session)).resolves.toBeUndefined();
    expect(wrapper.discover(["posts"], schema, session)).toBe(
      results.discoverStream,
    );
    expect(wrapper.continueDiscover("cursor", session)).toBe(
      results.continueStream,
    );

    expect(methods.login).toHaveBeenCalledWith(actor);
    expect(methods.logout).toHaveBeenCalledWith(session);
    expect(methods.handleToActor).toHaveBeenCalledWith("alice.example");
    expect(methods.actorToHandle).toHaveBeenCalledWith(actor);
    expect(methods.post).toHaveBeenCalledWith(postObject, session);
    expect(methods.get).toHaveBeenCalledWith(objectUrl, schema, session);
    expect(methods.delete).toHaveBeenCalledWith({ url: objectUrl }, session);
    expect(methods.postMedia).toHaveBeenCalledWith(postMedia, session);
    expect(methods.getMedia).toHaveBeenCalledWith(mediaUrl, accept, session);
    expect(methods.deleteMedia).toHaveBeenCalledWith(mediaUrl, session);
    expect(methods.discover).toHaveBeenCalledWith(["posts"], schema, session);
    expect(methods.continueDiscover).toHaveBeenCalledWith("cursor", session);
  });

  it("exposes the implementation's session event target", () => {
    const { methods, wrapper } = createSubject();
    const listener = vi.fn();

    wrapper.sessionEvents.addEventListener("login", listener);
    methods.sessionEvents.dispatchEvent(new Event("login"));

    expect(wrapper.sessionEvents).toBe(methods.sessionEvents);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("propagates asynchronous and synchronous implementation errors", async () => {
    const { methods, wrapper } = createSubject();
    const asyncError = new Error("get failed");
    const syncError = new Error("discover failed");
    methods.get.mockRejectedValueOnce(asyncError);
    methods.discover.mockImplementationOnce(() => {
      throw syncError;
    });

    await expect(wrapper.get(objectUrl, schema, session)).rejects.toBe(
      asyncError,
    );
    expect(() => wrapper.discover(["posts"], schema, session)).toThrow(
      syncError,
    );
  });
});

describe("exported schemas", () => {
  it("accepts the corresponding Graffiti values", () => {
    const blob = new Blob(["hello"]);
    const postObject = { value: {}, channels: ["posts"], allowed: [actor] };
    const object = { ...postObject, url: objectUrl, actor };
    const postMedia = { data: blob, allowed: [actor] };

    expect(GraffitiPostObjectSchema.parse(postObject)).toEqual(postObject);
    expect(GraffitiObjectSchema.parse(object)).toEqual(object);
    expect(GraffitiObjectUrlSchema.parse({ url: objectUrl })).toEqual({
      url: objectUrl,
    });
    expect(GraffitiSessionSchema.parse(session)).toEqual(session);
    expect(GraffitiOptionalSessionSchema.parse(null)).toBeNull();
    expect(GraffitiPostMediaSchema.parse(postMedia)).toEqual(postMedia);
    expect(GraffitiMediaSchema.parse({ ...postMedia, actor })).toEqual({
      ...postMedia,
      actor,
    });
    expect(
      GraffitiMediaAcceptSchema.parse({
        types: ["text/plain"],
        maxBytes: 100,
      }),
    ).toEqual({ types: ["text/plain"], maxBytes: 100 });
  });
});
