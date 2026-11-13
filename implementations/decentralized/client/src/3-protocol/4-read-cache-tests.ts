import { describe, expect, test, vi } from "vitest";
import { GraffitiErrorNotFound, GraffitiErrorSchemaMismatch, type GraffitiSession } from "@graffiti-garden/api";
import * as fakeIndexedDB from "fake-indexeddb";
import { GraffitiDecentralized } from "./4-graffiti";

export function readCacheTests(useGraffiti: () => GraffitiDecentralized, useSessions: () => GraffitiSession[]) {
  describe("Getter caching", () => {
    test("reuses object reads, preserves schema checks, and copies cached values", async () => {
      const graffiti = useGraffiti();
      const session = useSessions()[0];
      const posted = await graffiti.post({ value: { n: 1 }, channels: [] }, session);
      await graffiti.get(posted, {}, session);
      const original = globalThis.fetch;
      const calls: string[] = [];
      globalThis.fetch = (input, init) => {
        if (String(input).endsWith("/query")) calls.push(String(input));
        return original(input, init);
      };
      try {
        const cached = await graffiti.get(posted, {}, session);
        cached.value.n = 99;
        expect((await graffiti.get(posted, {}, session)).value).toEqual({ n: 1 });
        await expect(graffiti.get(posted, { properties: { value: { properties: { n: { const: 2 } } } } }, session))
          .rejects.toBeInstanceOf(GraffitiErrorSchemaMismatch);
        expect(calls).toHaveLength(0);
        await graffiti.get(posted, {}, session, { cache: "no-cache" });
        expect(calls.length).toBeGreaterThan(0);
      } finally { globalThis.fetch = original; }
      await graffiti.delete(posted, session);
      await expect(graffiti.get(posted, {}, session)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
    });

    test("discovery invalidates a cached read after another device deletes it", async () => {
      const writer = useGraffiti();
      const reader = useGraffiti();
      const session = useSessions()[0];
      const channel = crypto.randomUUID();
      const posted = await writer.post({ value: {}, channels: [channel] }, session);
      await reader.get(posted, {}, session);
      await writer.delete(posted, session);
      // Each Node instance has an independent cache, like separate devices.
      expect(await reader.get(posted, {}, session)).toEqual(posted);
      for await (const _ of reader.discover([channel], {}, session)) { /* receive tombstone */ }
      await expect(reader.get(posted, {}, session)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
    });

    test("does not retain a negative lookup containing old deleted messages", async () => {
      const writer = useGraffiti();
      const reader = useGraffiti();
      const session = useSessions()[0];
      const posted = await writer.post({ value: {}, channels: [] }, session);
      await writer.delete(posted, session);
      await expect(reader.get(posted, {}, session)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
      const original = globalThis.fetch;
      const queries: string[] = [];
      globalThis.fetch = (input, init) => {
        if (String(input).endsWith("/query")) queries.push(String(input));
        return original(input, init);
      };
      try {
        await expect(reader.get(posted, {}, session)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
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
        await writer.getMedia(url, {}, owner);
        const calls: { url: string; cache?: RequestCache }[] = [];
        globalThis.fetch = (input, init) => {
          calls.push({ url: String(input), cache: init?.cache });
          return original(input, init);
        };
        const reader = useGraffiti();
        expect(await (await reader.getMedia(url, {}, owner)).data.text()).toBe("private");
        expect(calls.filter(call => call.url.endsWith("/query"))).toHaveLength(0);
        expect(calls.filter(call => call.url.includes("/value/"))).toEqual([
          { url: expect.stringContaining("?cache=600"), cache: "default" },
        ]);
        await expect(reader.getMedia(url, {}, other)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
        await expect(reader.getMedia(url, {})).rejects.toBeInstanceOf(GraffitiErrorNotFound);
        await writer.deleteMedia(url, owner);
        await expect(reader.getMedia(url, {}, owner)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
      } finally {
        globalThis.fetch = original;
        vi.unstubAllGlobals();
      }
    });
  });
}
