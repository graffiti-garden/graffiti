import { describe, expect, test, vi } from "vitest";
import { GraffitiErrorNotFound, GraffitiErrorSchemaMismatch, type GraffitiSession, type GraffitiObjectStream } from "@graffiti-garden/api";
import * as fakeIndexedDB from "fake-indexeddb";
import { GraffitiDecentralized } from "./4-graffiti";

export function readCacheTests(useGraffiti: () => GraffitiDecentralized, useSessions: () => GraffitiSession[]) {
  describe("Read caching", () => {
    test("reuses object reads, preserves schema checks, and copies cached values", async () => {
      const graffiti = useGraffiti();
      const session = useSessions()[0];
      const posted = await graffiti.post({ value: { n: 1 }, channels: [] }, session);
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

    test("discovery invalidates a cached read after another device deletes it", async () => {
      const writer = useGraffiti();
      const reader = useGraffiti();
      const session = useSessions()[0];
      const channel = crypto.randomUUID();
      const posted = await writer.post({ value: {}, channels: [channel] }, session);
      await reader.get(posted, {}, { session });
      await writer.delete(posted, session);
      // Each Node instance has an independent cache, like separate devices.
      expect(await reader.get(posted, {}, { session })).toEqual(posted);
      for await (const _ of reader.discover([channel], {}, { session })) { /* receive tombstone */ }
      await expect(reader.get(posted, {}, { session })).rejects.toBeInstanceOf(GraffitiErrorNotFound);
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

    test("persists media descriptors across instances without sharing private access", async () => {
      for (const [name, value] of Object.entries(fakeIndexedDB)) {
        if (name.startsWith("IDB")) vi.stubGlobal(name, value);
      }
      vi.stubGlobal("indexedDB", new fakeIndexedDB.IDBFactory());
      const original = globalThis.fetch;
      try {
        const [owner, other] = useSessions();
        const writer = useGraffiti();
        const url = await writer.postMedia({ data: new Blob(["private"], { type: "text/plain" }), allowed: [] }, owner);
        await writer.getMedia(url, {}, { session: owner });
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

    test("reuses saved discovery and resumes its cursor to obtain new objects and deletions", async () => {
      const writer = useGraffiti();
      const reader = useGraffiti();
      const session = useSessions()[0];
      const channels = [crypto.randomUUID()];
      const first = await writer.post({ value: { n: 1 }, channels }, session);
      // A cache miss still fetches with refresh:false.
      const initial = await collect(reader.discover(channels, {}, { session, refresh: false }));
      expect(initial.objects.map(o => o.url)).toContain(first.url);
      const second = await writer.post({ value: { n: 2 }, channels }, session);
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
        const updated = await collect(reader.continueDiscover(unchanged.cursor, { session }));
        expect(requests.length).toBeGreaterThan(0);
        expect(updated.objects.map(o => o.url)).toContain(second.url);
        expect(updated.deleted).toContain(first.url);
        const snapshot = await collect(reader.discover(channels, {}, { session, refresh: false }));
        expect(snapshot.objects.map(o => o.url)).toEqual([second.url]);
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

    test("saved queries reflect local deletion and deletion observed by a different query", async () => {
      const writer = useGraffiti();
      const reader = useGraffiti();
      const session = useSessions()[0];
      const channels = [crypto.randomUUID()];
      const posted = await writer.post({ value: { n: 1 }, channels }, session);
      await collect(writer.discover(channels, {}, { session }));
      await collect(reader.discover(channels, {}, { session }));
      await writer.delete(posted, session);
      expect((await collect(writer.discover(channels, {}, { session, refresh: false }))).objects).toEqual([]);
      // Different schema, same underlying message. Its deletion must also
      // update the previously saved query without requiring that query to poll.
      await collect(reader.discover(channels, { properties: { value: { properties: { n: { const: 1 } } } } }, { session }));
      expect((await collect(reader.discover(channels, {}, { session, refresh: false }))).objects).toEqual([]);
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
