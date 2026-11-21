import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { GraffitiErrorNotFound } from "@graffiti-garden/api";
import { GraffitiDecentralized } from "./5-graffiti";
import { mockCacheStorage } from "./4-discovery/cache-tests";

const session = { actor: "did:example:writer" };
class Client extends GraffitiDecentralized {
  get services() {
    return { sessions: this.sessions, storage: this.storageBuckets, inboxes: this.inboxes, history: this.inboxHistory };
  }
}

beforeEach(() => { vi.useFakeTimers(); mockCacheStorage(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function client(writeGracePeriod = 60_000) {
  const graffiti = new Client({ writeGracePeriod, defaultInboxEndpoints: [] });
  const service = { token: "token", authorizationEndpoint: "https://test.invalid/auth" };
  vi.spyOn(graffiti.services.sessions, "resolveSession").mockReturnValue({
    ...session, tokens: [], servicesByAuthorization: [],
    storageBucket: { ...service, serviceEndpoint: "https://test.invalid/bucket" },
    personalInbox: { ...service, serviceEndpoint: "https://test.invalid/inbox" },
    sharedInboxes: [],
  });
  const put = vi.spyOn(graffiti.services.storage, "put").mockResolvedValue();
  const remove = vi.spyOn(graffiti.services.storage, "delete").mockResolvedValue();
  vi.spyOn(graffiti.services.inboxes, "send").mockResolvedValue("announcement");
  vi.spyOn(graffiti.services.inboxes, "pin").mockResolvedValue();
  vi.spyOn(graffiti.services.history, "query").mockImplementation(async function* () { return ""; });
  return { graffiti, put, remove };
}

test("recovers locally accepted writes and flushes only selected URLs", async () => {
  const { graffiti, put } = client();
  const first = await graffiti.post({ value: { x: 1 }, channels: ["game"], allowed: [] }, session);
  const second = await graffiti.post({ value: { x: 2 }, channels: ["game"] }, session);
  expect(put).not.toHaveBeenCalled();
  const restored = client();
  expect(await restored.graffiti.get(first, {}, session)).toEqual(first);
  await expect(restored.graffiti.get(first, {})).rejects.toBeInstanceOf(GraffitiErrorNotFound);
  await restored.graffiti.flush({ urls: [first.url] }, session);
  expect(restored.put).toHaveBeenCalledTimes(1);
  await restored.graffiti.flush({}, session);
  expect(restored.put).toHaveBeenCalledTimes(2);
  expect((await restored.graffiti.get(second, {}, session)).url).toBe(second.url);
});

test("deletion cancels an unstarted upload and appears in continued local discovery", async () => {
  const { graffiti, put, remove } = client();
  const object = await graffiti.post({ value: { x: 1 }, channels: ["game"] }, session);
  const initial = graffiti.discover(["game"], {}, session);
  expect((await initial.next()).value).toEqual({ object });
  const end = await initial.next();
  if (!end.done) throw new Error("Expected the discovery cursor");
  await graffiti.delete(object, session);
  await graffiti.flush({}, session);
  expect(put).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  await expect(graffiti.get(object, {}, session)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
  const next = graffiti.continueDiscover(end.value.cursor, session);
  expect((await next.next()).value).toEqual({ object, tombstone: true });
  await next.return({ cursor: "" });
});

test("retrying a failed flush reuses the exact storage key and encoded bytes", async () => {
  const { graffiti, put } = client();
  const object = await graffiti.post({ value: { text: "keep me" }, channels: [] }, session);
  put.mockRejectedValueOnce(new Error("offline"));
  await expect(graffiti.flush({ urls: [object.url] }, session)).rejects.toThrow("offline");
  await graffiti.flush({ urls: [object.url] }, session);
  expect(put.mock.calls[1]).toEqual(put.mock.calls[0]);
  expect(await graffiti.get(object, {}, session)).toEqual(object);
});

test("flush captures a batch without waiting for later posts", async () => {
  const { graffiti, put } = client();
  await graffiti.post({ value: { x: 1 }, channels: [] }, session);
  const upload = Promise.withResolvers<void>();
  put.mockImplementationOnce(() => upload.promise);
  const flushing = graffiti.flush({}, session);
  await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  const later = await graffiti.post({ value: { x: 2 }, channels: [] }, session);
  upload.resolve();
  await flushing;
  expect(put).toHaveBeenCalledTimes(1);
  await graffiti.flush({ urls: [later.url] }, session);
  expect(put).toHaveBeenCalledTimes(2);
});

test("a delete accepted during upload runs after that upload", async () => {
  const { graffiti, put, remove } = client();
  const object = await graffiti.post({ value: {}, channels: [] }, session);
  const upload = Promise.withResolvers<void>();
  put.mockImplementationOnce(() => upload.promise);
  const flushing = graffiti.flush({ urls: [object.url] }, session);
  await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  await graffiti.delete(object, session);
  await expect(graffiti.get(object, {}, session)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
  upload.resolve();
  await flushing;
  expect(remove).toHaveBeenCalledWith("https://test.invalid/bucket", put.mock.calls[0][1], "token");
  expect(put).toHaveBeenCalledTimes(1);
});

test("media survives reopening and the configured grace period triggers upload", async () => {
  const { graffiti, put } = client(1000);
  const url = await graffiti.postMedia({ data: new Blob(["hello"], { type: "text/plain" }) }, session);
  const restored = client();
  expect(await (await restored.graffiti.getMedia(url, {}, session)).data.text()).toBe("hello");
  await vi.advanceTimersByTimeAsync(999);
  expect(put).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(2));
});
