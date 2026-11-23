import { describe, expect, test, vi } from "vitest";
import { GraffitiErrorNotFound, GraffitiErrorSchemaMismatch, type GraffitiSession, type GraffitiObjectStream } from "@graffiti-garden/api";
import { mockCacheStorage } from "./4-discovery/cache-tests";
import { GraffitiDecentralized } from "./5-graffiti";
import { StorageBuckets } from "../1-services/3-storage-buckets";
import { Inboxes } from "../1-services/4-inboxes";

export function readCacheTests(useGraffiti: () => GraffitiDecentralized, useSessions: () => GraffitiSession[]) {
  describe("Read caching", () => {
    test("reuses object reads, preserves schema checks, and copies cached values", async () => {
      const graffiti = useGraffiti();
      const session = useSessions()[0];
      const posted = await graffiti.post({ value: { n: 1 }, channels: [] }, session);
      await graffiti.flush(posted.url, session);
      await graffiti.get(posted, {}, { session });
      const original = globalThis.fetch;
      const calls: string[] = [];
      globalThis.fetch = (input, init) => {
        if (String(input).endsWith("/query")) calls.push(String(input));
        return original(input, init);
      };
      try {
        const cached = await graffiti.get(posted, {}, { session });
        cached.value.n = 99;
        expect((await graffiti.get(posted, {}, { session })).value).toEqual({ n: 1 });
        await expect(graffiti.get(posted, { properties: { value: { properties: { n: { const: 2 } } } } }, { session }))
          .rejects.toBeInstanceOf(GraffitiErrorSchemaMismatch);
        expect(calls).toHaveLength(0);
        await graffiti.get(posted, {}, { session, refresh: true });
        expect(calls.length).toBeGreaterThan(0);
      } finally { globalThis.fetch = original; }
      await graffiti.delete(posted, session);
      await expect(graffiti.get(posted, {}, { session })).rejects.toBeInstanceOf(GraffitiErrorNotFound);
    });

    test("does not retain a negative lookup containing old deleted messages", async () => {
      const writer = useGraffiti();
      const reader = useGraffiti();
      const session = useSessions()[0];
      const posted = await writer.post({ value: {}, channels: [] }, session);
      await writer.delete(posted, session);
      await expect(reader.get(posted, {}, { session })).rejects.toBeInstanceOf(GraffitiErrorNotFound);
      const original = globalThis.fetch;
      const queries: string[] = [];
      globalThis.fetch = (input, init) => {
        if (String(input).endsWith("/query")) queries.push(String(input));
        return original(input, init);
      };
      try {
        await expect(reader.get(posted, {}, { session })).rejects.toBeInstanceOf(GraffitiErrorNotFound);
        expect(queries.length).toBeGreaterThan(0);
      } finally {
        globalThis.fetch = original;
      }
    });

    test("a read started before deletion cannot revive the object in another instance", async () => {
      mockCacheStorage();
      const writer = useGraffiti();
      const reader = useGraffiti();
      const session = useSessions()[0];
      let release!: () => void;
      const blocked = new Promise<void>(resolve => { release = resolve; });
      const original = StorageBuckets.prototype.get;
      let read: ReturnType<typeof vi.spyOn> | undefined;
      let fetched = false;
      try {
        const posted = await writer.post<{}>({ value: {}, channels: [] }, session);
        await writer.flush(posted.url, session);
        await writer.get<{}>(posted, {}, { session });
        // The owner has verified its announcement. An anonymous reader starts
        // validating a different announcement of the same key before deletion.
        read = vi.spyOn(StorageBuckets.prototype, "get").mockImplementation(async function (this: StorageBuckets, ...args) {
          const bytes = await original.apply(this, args);
          fetched = true;
          await blocked;
          return bytes;
        });
        const pending = reader.get<{}>(posted, {}, { refresh: true });
        // Attach the rejection assertion before allowing the read to settle.
        const absent = expect(pending).rejects.toBeInstanceOf(GraffitiErrorNotFound);
        await vi.waitFor(() => expect(fetched).toBe(true));
        await writer.delete(posted, session);
        release();
        await absent;
        read.mockRestore();
        await expect(reader.get<{}>(posted, {})).rejects.toBeInstanceOf(GraffitiErrorNotFound);
      } finally {
        release();
        read?.mockRestore();
        vi.unstubAllGlobals();
      }
    });

    test.each(["upload", "deletion"])("media %s bypasses the object outbox and waits for storage", async operation => {
      const caches = mockCacheStorage();
      const writer = useGraffiti();
      const reader = useGraffiti();
      const session = useSessions()[0];
      const media = { data: new Blob(["confirmed"], { type: "text/plain" }) };
      const reachedStorage = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const original = globalThis.fetch;
      try {
        const url = operation === "deletion" ? await writer.postMedia(media, session) : undefined;
        globalThis.fetch = async (input, init) => {
          if (init?.method === (operation === "upload" ? "PUT" : "DELETE")) {
            reachedStorage.resolve();
            await release.promise;
          }
          return original(input, init);
        };
        let complete = false;
        const pending = (url === undefined ? writer.postMedia(media, session) : writer.deleteMedia(url, session))
          .then(result => { complete = true; return result; });
        await reachedStorage.promise;
        expect(complete).toBe(false);
        expect(caches("graffiti-outbox-v1").entries.size).toBe(0);
        release.resolve();
        const result = await pending;
        if (typeof result === "string") {
          expect(await (await reader.getMedia(result, {}, { refresh: true })).data.text()).toBe("confirmed");
          await writer.deleteMedia(result, session);
        } else {
          await expect(reader.getMedia(url!, {}, { refresh: true })).rejects.toBeInstanceOf(GraffitiErrorNotFound);
        }
      } finally {
        release.resolve();
        globalThis.fetch = original;
        vi.unstubAllGlobals();
      }
    });

    test("persists media descriptors across instances without sharing private access", async () => {
      const caches = mockCacheStorage();
      const original = globalThis.fetch;
      try {
        const [owner, other] = useSessions();
        const writer = useGraffiti();
        const url = await writer.postMedia({ data: new Blob(["private"], { type: "text/plain" }), allowed: [] }, owner);
        await writer.getMedia(url, {}, { session: owner });
        // Dropping query history must leave shared payloads available to
        // verified getters, even in another instance.
        caches("graffiti-inbox-queries-v1").entries.clear();
        const calls: { url: string; cache?: RequestCache }[] = [];
        globalThis.fetch = (input, init) => {
          calls.push({ url: String(input), cache: init?.cache });
          return original(input, init);
        };
        const reader = useGraffiti();
        expect(await (await reader.getMedia(url, {}, { session: owner })).data.text()).toBe("private");
        expect(calls.filter(call => call.url.endsWith("/query"))).toHaveLength(0);
        expect(calls.filter(call => call.url.includes("/value/"))).toEqual([
          { url: expect.stringMatching(/\/value\/[^?]+$/), cache: "default" },
        ]);
        await expect(reader.getMedia(url, {}, { session: other })).rejects.toBeInstanceOf(GraffitiErrorNotFound);
        await expect(reader.getMedia(url, {})).rejects.toBeInstanceOf(GraffitiErrorNotFound);
        await writer.deleteMedia(url, owner);
        await expect(reader.getMedia(url, {}, { session: owner })).rejects.toBeInstanceOf(GraffitiErrorNotFound);
      } finally {
        globalThis.fetch = original;
        vi.unstubAllGlobals();
      }
    });

    test("reuses saved discovery and continuation without querying inboxes", async () => {
      const writer = useGraffiti();
      const reader = useGraffiti();
      const session = useSessions()[0];
      const channels = [crypto.randomUUID()];
      const first = await writer.post({ value: { n: 1 }, channels }, session);
      // A cache miss still fetches with refresh:false.
      const initial = await collect(reader.discover(channels, {}, { session, refresh: false }));
      expect(initial.objects.map(o => o.url)).toContain(first.url);
      await writer.post({ value: { n: 2 }, channels }, session);
      await writer.delete(first, session);

      const original = globalThis.fetch;
      const requests: string[] = [];
      globalThis.fetch = (input, init) => {
        if (String(input).endsWith("/query")) requests.push(String(input));
        return original(input, init);
      };
      try {
        const saved = await collect(reader.discover(channels, {}, { session, refresh: false }));
        expect(saved.objects.map(o => o.url)).toEqual([first.url]);
        expect(requests).toHaveLength(0);
        const unchanged = await collect(reader.continueDiscover(saved.cursor, { session, refresh: false }));
        expect(unchanged.objects).toEqual([]);
        expect(unchanged.deleted).toEqual([]);
        expect(requests).toHaveLength(0);
        await collect(reader.continueDiscover(unchanged.cursor, { session }));
        expect(requests.length).toBeGreaterThan(0);
      } finally { globalThis.fetch = original; }
    });

    test("a completed empty discovery is reusable, and default discovery refreshes it", async () => {
      const writer = useGraffiti();
      const reader = useGraffiti();
      const session = useSessions()[0];
      const channels = [crypto.randomUUID()];
      expect((await collect(reader.discover(channels, {}, { session }))).objects).toEqual([]);
      const posted = await writer.post({ value: {}, channels }, session);
      const original = globalThis.fetch;
      const requests: string[] = [];
      globalThis.fetch = (input, init) => {
        if (String(input).endsWith("/query")) requests.push(String(input));
        return original(input, init);
      };
      try {
        expect((await collect(reader.discover(channels, {}, { session, refresh: false }))).objects).toEqual([]);
        expect(requests).toEqual([]);
        expect((await collect(reader.discover(channels, {}, { session }))).objects.map(o => o.url)).toContain(posted.url);
        expect(requests.length).toBeGreaterThan(0);
      } finally { globalThis.fetch = original; }
    });
    test("keeps a storage-observed deletion when remote labeling fails", async () => {
      const writer = useGraffiti();
      const reader = useGraffiti();
      const session = useSessions()[0];
      const channels = [crypto.randomUUID()];
      const posted = await writer.post<{}>({ value: {}, channels }, session);
      const storage = vi.spyOn(StorageBuckets.prototype, "get")
        .mockRejectedValue(new GraffitiErrorNotFound("Object was deleted"));
      const labeling = vi.spyOn(Inboxes.prototype, "label")
        .mockRejectedValue(new Error("Label request failed"));
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        expect((await collect(reader.discover<{}>(channels, {}, { session }))).objects).toEqual([]);
        expect(labeling).toHaveBeenCalled();
        storage.mockRestore();
        // A known deletion must remain deleted locally even if the server
        // label was never updated and old storage bytes become available again.
        expect((await collect(reader.discover<{}>(channels, {}, { session, refresh: false }))).objects).toEqual([]);
      } finally {
        storage.mockRestore();
        labeling.mockRestore();
        errors.mockRestore();
        await writer.delete(posted, session);
      }
    });
  });
}

async function collect(stream: GraffitiObjectStream<{}>) {
  const objects = new Map<string, import("@graffiti-garden/api").GraffitiObject<{}>>();
  const deleted: string[] = [];
  while (true) {
    const result = await stream.next();
    if (result.done) return { objects: [...objects.values()], deleted, cursor: result.value.cursor };
    if (result.value.error) throw result.value.error;
    if (result.value.tombstone) {
      objects.delete(result.value.object.url);
      deleted.push(result.value.object.url);
    } else objects.set(result.value.object.url, result.value.object);
  }
}
