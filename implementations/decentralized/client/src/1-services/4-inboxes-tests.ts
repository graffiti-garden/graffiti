import { afterEach, assert, describe, expect, test, vi } from "vitest";
import { Inboxes, LABELED_MESSAGE_LABEL_KEY } from "./4-inboxes";
import { GraffitiErrorUnauthorized } from "./utilities";
import { randomBytes } from "@noble/hashes/utils.js";
import { GraffitiErrorCursorExpired, type GraffitiObjectBase } from "@graffiti-garden/api";
import { encode as dagCborEncode, decode as dagCborDecode } from "@ipld/dag-cbor";

export function inboxTests(inboxEndpoint: string, inboxToken: string) {
  describe("Inboxes", async () => {
    const inboxes = new Inboxes();

    test("send, get", async () => {
      const tags = [randomBytes(), randomBytes()];
      const metadata = randomBytes();
      const object: GraffitiObjectBase = {
        url: "url:example",
        actor: "did:example",
        channels: ["example", "something"],
        value: {
          nested: {
            property: [1, "askdfj", null],
          },
        },
        allowed: ["did:example2"],
      };

      const sending = {
        m: metadata,
        o: object,
        t: tags,
      };
      const messageId = await inboxes.send(inboxEndpoint, sending);

      // Get the message back
      const message = await inboxes.get(inboxEndpoint, messageId, inboxToken);
      assert(message !== null);
      expect(message.m).toEqual(sending);
      expect(message.l).toEqual(0);

      const iterator = inboxes.query<{}>(inboxEndpoint, tags, {}, inboxToken);

      const result = await iterator.next();
      assert(!result.done);

      // No label yet so it must be zero
      expect(result.value.l).toEqual(0);

      expect(result.value.m.t).toEqual(tags);
      expect(result.value.m.o).toEqual(object);
      expect(result.value.id).toEqual(messageId);

      const endResult = await iterator.next();
      expect(endResult.done).toBe(true);

      // Label the message
      await inboxes.label(inboxEndpoint, messageId, 42, inboxToken);

      const iterator2 = inboxes.query<{}>(inboxEndpoint, tags, {}, inboxToken);

      const result2 = await iterator2.next();
      assert(!result2.done);
      expect(result2.value.l).toEqual(42);
      const endResult2 = await iterator2.next();
      expect(endResult2.done).toBe(true);

      const message2 = await inboxes.get(inboxEndpoint, messageId, inboxToken);
      assert(message2 !== null);
      expect(message2.m).toEqual(sending);
      expect(message2.l).toEqual(42);
    });

    test("query with continue", async () => {
      const tags = [randomBytes(), randomBytes()];

      const nullResult = await inboxes
        .query<{}>(inboxEndpoint, tags, {}, inboxToken)
        .next();
      assert(nullResult.done);
      const cursor = nullResult.value;

      const metadata = randomBytes();

      const messageId = await inboxes.send(inboxEndpoint, {
        o: {
          url: "url:example",
          actor: "did:example",
          channels: ["example", "something"],
          value: {
            nested: {
              property: [1, "askdfj", null],
            },
          },
          allowed: ["did:example2"],
        },
        t: [randomBytes(), tags[0]],
        m: metadata,
      });

      const result = await inboxes
        .continueQuery(inboxEndpoint, cursor, inboxToken)
        .next();
      assert(!result.done);
      expect(result.value.id).toEqual(messageId);
    });

    test("unauthorized access", async () => {
      const tags = [randomBytes()];

      await expect(
        inboxes.query(inboxEndpoint, tags, {}, "invalid-token").next(),
      ).rejects.toThrowError(GraffitiErrorUnauthorized);
      await expect(
        inboxes.label(inboxEndpoint, "1", 1, "invalid-token"),
      ).rejects.toThrowError(GraffitiErrorUnauthorized);
      await expect(
        inboxes.export(inboxEndpoint, "invalid-token").next(),
      ).rejects.toThrowError(GraffitiErrorUnauthorized);
    }, 30000);

    test("body cursors preserve authorization, expiry and rate limits", async () => {
      const headers = {
        "Content-Type": "application/cbor",
        Authorization: `Bearer ${inboxToken}`,
      };
      const initial = await fetch(`${inboxEndpoint}/query`, {
        method: "POST", headers,
        body: dagCborEncode({ tags: [randomBytes()], schema: {} }).slice(),
      });
      expect(initial.status).toBe(200);
      expect(initial.headers.get("Graffiti-Cursor-Transport")).toBe("body");
      expect(initial.headers.get("Access-Control-Expose-Headers"))
        .toContain("Graffiti-Cursor-Transport");
      const { cursor } = dagCborDecode(await initial.arrayBuffer()) as { cursor: string };
      for (const bodyCursor of [false, true]) {
        const response = await fetch(
          `${inboxEndpoint}/query${bodyCursor ? "" : `?cursor=${encodeURIComponent(cursor)}`}`,
          { method: "POST", headers,
            body: bodyCursor ? dagCborEncode({ cursor }).slice() : undefined },
        );
        expect(response.status).toBe(429);
      }
      const decoded = dagCborDecode(Buffer.from(cursor, "base64url")) as
        Record<string, unknown>;
      const expired = Buffer.from(dagCborEncode({ ...decoded, createdAt: 0, waitTil: 0 }))
        .toString("base64url");
      for (const [body, status] of [
        [{ cursor: "invalid-cursor" }, 410],
        [{ cursor: expired }, 410],
        [{ cursor: "" }, 400],
        [{ unexpected: true }, 400],
      ] as const) {
        const response = await fetch(`${inboxEndpoint}/query`, {
          method: "POST", headers,
          body: dagCborEncode(body).slice(),
        });
        expect(response.status).toBe(status);
      }
      const unauthorized = await fetch(`${inboxEndpoint}/query`, {
        method: "POST", headers: { ...headers, Authorization: "Bearer invalid-token" },
        body: dagCborEncode({ cursor }).slice(),
      });
      expect(unauthorized.status).toBe(401);
      const forbidden = await fetch(`${inboxEndpoint}/query`, {
        method: "POST", headers: { "Content-Type": "application/cbor" },
        body: dagCborEncode({ tags: [randomBytes()], schema: {} }).slice(),
      });
      expect(forbidden.status).toBe(403);
    });

    test("query paged", async () => {
      const tags = [randomBytes(), randomBytes()];

      const numSends = 211;
      for (let i = 0; i < numSends; i++) {
        await inboxes.send(inboxEndpoint, {
          t: tags,
          m: randomBytes(),
          o: {
            url: "url:example",
            actor: "did:example",
            channels: ["example", "something"],
            value: {
              nested: {
                property: [1, "askdfj", null],
              },
            },
            allowed: ["did:example2"],
          },
        });
      }

      let cursor: string | undefined;
      for (const [page, expectedCount] of [10, 100, 101].entries()) {
        const response = await fetch(
          `${inboxEndpoint}/query${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/cbor",
              Authorization: `Bearer ${inboxToken}`,
            },
            body: cursor ? undefined : dagCborEncode({ tags: [tags[1]], schema: {} }).slice(),
          },
        );
        expect(response.status).toBe(200);
        const pageResult = dagCborDecode(new Uint8Array(await response.arrayBuffer())) as {
          results: unknown[];
          hasMore: boolean;
          cursor: string;
        };
        expect(pageResult.results).toHaveLength(expectedCount);
        expect(pageResult.hasMore).toBe(page < 2);
        cursor = pageResult.cursor;
      }

      const iterator = inboxes.query(
        inboxEndpoint,
        [randomBytes(), tags[1], randomBytes()],
        {},
        inboxToken,
      );

      const fetchOriginal = globalThis.fetch;
      const requests: { url: string; body: unknown }[] = [];
      globalThis.fetch = async (input, init) => {
        if (String(input).includes("/query")) requests.push({
          url: String(input),
          body: init?.body ? dagCborDecode(init.body as Uint8Array) : undefined,
        });
        return fetchOriginal(input, init);
      };
      let count = 0;
      try {
        for await (const _ of iterator) count++;
      } finally {
        globalThis.fetch = fetchOriginal;
      }
      expect(count).toBe(numSends);
      expect(new Set(requests.map((request) => request.url))).toEqual(
        new Set([`${inboxEndpoint}/query`]),
      );
      expect(requests.slice(1).every((request) =>
        !!request.body && typeof request.body === "object" && "cursor" in request.body,
      )).toBe(true);
    }, 100000);
  });
}

// Focused client behavior tests use mocked network and browser locks.
const inboxUrl = "https://example.test/inbox";
const message = {
  id: "message-1",
  m: {
    t: [new Uint8Array([1])],
    o: {
      url: "https://example.test/object",
      actor: "did:example:author",
      channels: ["test"],
      value: {},
    },
    m: new Uint8Array([2]),
  },
  l: 0,
};

function cborResponse(value: unknown) {
  return new Response(new Uint8Array(dagCborEncode(value)).slice(), {
    headers: { "Content-Type": "application/cbor" },
  });
}

function queryPage(results: (typeof message)[], cursor: string, hasMore = false) {
  return cborResponse({ results, hasMore, cursor });
}

class TestInboxes extends Inboxes {
  requestBatch(
    endpoint: string,
    type: "query" | "export",
    cursor?: string,
    token?: string,
    signal?: AbortSignal,
  ) {
    return this.fetchMessageBatch(endpoint, type, undefined, token, cursor, signal);
  }
  async prepareCache() {
    await this.cache;
  }

  async deleteCachedQuery(key: string) {
    await (await this.cache).messageIds.del(key);
  }

  async fetchQueryBatch() {
    const batch = await this.fetchMessageBatch(
      "https://example.test/inbox",
      "query",
      undefined,
    );
    await batch.response.arrayBuffer();
    return batch;
  }
}

function enableLockPath(request: unknown) {
  vi.stubGlobal("indexedDB", {
    open: () => {
      const probe: { result?: { close: () => void }; onsuccess?: () => void } = {};
      queueMicrotask(() => {
        probe.result = { close() {} };
        probe.onsuccess?.();
      });
      return probe;
    },
  });
  vi.stubGlobal("window", { navigator: { locks: { request } } });
}

export function inboxUnitTests() {
  describe("Inboxes unit", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    describe("cursor transport negotiation", () => {
      function response(advertise = false) {
        const result = queryPage([], "next-cursor");
        if (advertise) result.headers.set("Graffiti-Cursor-Transport", "body");
        return result;
      }

      test("old servers use URL cursors without a probe or retry", async () => {
        const fetch = vi.fn<typeof globalThis.fetch>(async () => response());
        vi.stubGlobal("fetch", fetch);
        const inboxes = new TestInboxes();
        await inboxes.requestBatch(inboxUrl, "query");
        await inboxes.requestBatch(inboxUrl, "query", "cursor-1");
        await inboxes.requestBatch(inboxUrl, "query", "cursor-2");
        expect(fetch.mock.calls.map((call) => call[0])).toEqual([
          `${inboxUrl}/query`, `${inboxUrl}/query?cursor=cursor-1`,
          `${inboxUrl}/query?cursor=cursor-2`,
        ]);
      });

      test("advertised endpoints reuse their URL and preserve authorization", async () => {
        const fetch = vi.fn<typeof globalThis.fetch>(async () => response(true));
        vi.stubGlobal("fetch", fetch);
        const inboxes = new TestInboxes();
        await inboxes.requestBatch(inboxUrl, "query", undefined, "synthetic-token");
        await inboxes.requestBatch(inboxUrl, "query", "cursor-1", "synthetic-token");
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch.mock.calls.map((call) => call[0])).toEqual([
          `${inboxUrl}/query`, `${inboxUrl}/query`,
        ]);
        const init = fetch.mock.calls[1][1] as RequestInit;
        expect(dagCborDecode(init.body as Uint8Array)).toEqual({ cursor: "cursor-1" });
        expect(new Headers(init.headers).get("Authorization")).toBe("Bearer synthetic-token");
      });

      test("support is scoped to the query endpoint and is not persisted", async () => {
        const fetch = vi.fn<typeof globalThis.fetch>(async () => response(true));
        vi.stubGlobal("fetch", fetch);
        const inboxes = new TestInboxes();
        await inboxes.requestBatch(inboxUrl, "query");
        await inboxes.requestBatch(`${inboxUrl}-other`, "query", "cursor-1");
        await inboxes.requestBatch(inboxUrl, "export", "cursor-1");
        await new TestInboxes().requestBatch(inboxUrl, "query", "cursor-1");
        expect(fetch.mock.calls.slice(1).map((call) => call[0])).toEqual([
          `${inboxUrl}-other/query?cursor=cursor-1`,
          `${inboxUrl}/export?cursor=cursor-1`,
          `${inboxUrl}/query?cursor=cursor-1`,
        ]);
      });

      test.each([400, 401, 403, 410, 429, 500])(
        "status %i remains an error without transport retries",
        async (status) => {
          const fetch = vi.fn().mockResolvedValueOnce(response(true))
            .mockResolvedValueOnce(new Response("protocol failure", { status }))
            .mockResolvedValueOnce(response());
          vi.stubGlobal("fetch", fetch);
          const inboxes = new TestInboxes();
          await inboxes.requestBatch(inboxUrl, "query");
          await expect(inboxes.requestBatch(inboxUrl, "query", "cursor-1"))
            .rejects.toThrow("protocol failure");
          expect(fetch).toHaveBeenCalledTimes(2);
          // A later caller can recover from a server downgrade, without
          // changing the failed call's error or treating 410 as negotiation.
          await inboxes.requestBatch(inboxUrl, "query", "cursor-1");
          expect(fetch.mock.calls[2][0]).toBe(`${inboxUrl}/query?cursor=cursor-1`);
        },
      );

      test("missing advertisement preserves results and uses URLs on later calls", async () => {
        const successful = response();
        const fetch = vi.fn().mockResolvedValueOnce(response(true))
          .mockResolvedValueOnce(successful).mockResolvedValueOnce(response());
        vi.stubGlobal("fetch", fetch);
        const inboxes = new TestInboxes();
        await inboxes.requestBatch(inboxUrl, "query");
        const result = await inboxes.requestBatch(inboxUrl, "query", "cursor-1");
        expect(result.response).toBe(successful);
        expect(fetch).toHaveBeenCalledTimes(2);
        await inboxes.requestBatch(inboxUrl, "query", "cursor-2");
        expect(fetch.mock.calls.slice(1).map((call) => call[0])).toEqual([
          `${inboxUrl}/query`, `${inboxUrl}/query?cursor=cursor-2`,
        ]);
      });
    });

    describe("inbox stream lock and network failures", () => {
      test("backs off for five seconds after an initial request failure", async () => {
        const failure = new Error("offline");
        const fetch = vi.fn(() => Promise.reject(failure));
        vi.stubGlobal("fetch", fetch);
        vi.spyOn(console, "error").mockImplementation(() => {});
        const realSetTimeout = globalThis.setTimeout;
        const timer = vi.spyOn(globalThis, "setTimeout").mockImplementation(
          ((handler: TimerHandler, delay?: number, ...args: unknown[]) =>
            realSetTimeout(
              handler,
              delay === 5000 ? 0 : delay,
              ...args,
            )) as typeof setTimeout,
        );

        await expect(new Inboxes().query(inboxUrl, [], {}).next()).rejects.toBe(
          failure,
        );
        expect(fetch).toHaveBeenCalledOnce();
        expect(timer).toHaveBeenCalledWith(expect.any(Function), 5000);
      });

      test("a rejected lock request rejects the stream", async () => {
        const inboxes = new TestInboxes();
        await inboxes.prepareCache();
        const error = new Error("lock request failed");
        enableLockPath(vi.fn(() => Promise.reject(error)));

        await expect(
          inboxes.query("https://example.test/inbox", [], {}).next(),
        ).rejects.toBe(error);
      });

      test("waiting for another tab's lock has a deadline", async () => {
        const inboxes = new TestInboxes();
        await inboxes.prepareCache();
        const timeoutError = new DOMException("timed out", "TimeoutError");
        vi.spyOn(AbortSignal, "timeout").mockReturnValue(
          AbortSignal.abort(timeoutError),
        );
        const request = vi.fn(
          (
            _key: string,
            _options: { signal?: AbortSignal },
          ) => Promise.reject(timeoutError),
        );
        enableLockPath(request);

        await expect(
          inboxes.query("https://example.test/inbox", [], {}).next(),
        ).rejects.toThrow("Timed out waiting for another tab's inbox query");
        expect(request).toHaveBeenCalledOnce();
      });

      test("a stalled request is aborted", async () => {
        const realTimeout = AbortSignal.timeout;
        vi.spyOn(AbortSignal, "timeout").mockImplementation(() => realTimeout(5));
        vi.stubGlobal(
          "fetch",
          vi.fn((_url: string, options: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              const signal = options.signal as AbortSignal;
              signal.addEventListener("abort", () => reject(signal.reason), {
                once: true,
              });
            }),
          ),
        );

        await expect(new TestInboxes().fetchQueryBatch()).rejects.toMatchObject({
          name: "TimeoutError",
        });
      });

      test("the deadline remains active while reading a response body", async () => {
        const realTimeout = AbortSignal.timeout;
        vi.spyOn(AbortSignal, "timeout").mockImplementation(() => realTimeout(5));
        vi.stubGlobal(
          "fetch",
          vi.fn((_url: string, options: RequestInit) => {
            const signal = options.signal as AbortSignal;
            const body = new ReadableStream({
              start(controller) {
                signal.addEventListener("abort", () => controller.error(signal.reason), {
                  once: true,
                });
              },
            });
            return Promise.resolve(new Response(body));
          }),
        );

        await expect(new TestInboxes().fetchQueryBatch()).rejects.toMatchObject({
          name: "TimeoutError",
        });
      });
    });

    describe("inbox query cache", () => {
      test("fetches the next page while the current message is yielded", async () => {
        const inboxes = new TestInboxes();
        await inboxes.prepareCache();
        let held = 0;
        enableLockPath(vi.fn(async (
          key: string,
          _options: { signal?: AbortSignal },
          callback: (lock: Lock) => Promise<unknown>,
        ) => {
          held++;
          try {
            return await callback({ name: key, mode: "exclusive" });
          } finally {
            held--;
          }
        }));
        let prefetchAborted = false;
        const fetch = vi.fn((_url: string, options: RequestInit) => {
          if (fetch.mock.calls.length === 1) {
            return Promise.resolve(queryPage([message], "cursor-1", true));
          }
          return new Promise<Response>((_resolve, reject) => {
            const signal = options.signal as AbortSignal;
            signal.addEventListener("abort", () => {
              prefetchAborted = true;
              reject(signal.reason);
            }, { once: true });
          });
        });
        vi.stubGlobal("fetch", fetch);

        const iterator = inboxes.query(inboxUrl, [new Uint8Array([1])], {});
        expect((await iterator.next()).value).toEqual(message);
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
        expect(fetch.mock.calls[1][0]).toBe(`${inboxUrl}/query?cursor=cursor-1`);
        await iterator.return("");
        expect(prefetchAborted).toBe(true);
        await vi.waitFor(() => expect(held).toBe(0));
      });

      test("reports a cursor that expires after the first page", async () => {
        const fetch = vi.fn()
          .mockResolvedValueOnce(queryPage([message], "cursor-1", true))
          .mockResolvedValueOnce(new Response("stale", { status: 410 }));
        vi.stubGlobal("fetch", fetch);

        const iterator = new Inboxes().query(inboxUrl, [new Uint8Array([1])], {});
        expect((await iterator.next()).value).toEqual(message);
        await expect(iterator.next()).rejects.toBeInstanceOf(
          GraffitiErrorCursorExpired,
        );
        expect(fetch).toHaveBeenCalledTimes(2);
      });

      test("does not replay messages after another tab resets the cache", async () => {
        const inboxes = new TestInboxes();
        await inboxes.prepareCache();
        let markPrefetchStarted!: () => void;
        const prefetchStarted = new Promise<void>((resolve) => {
          markPrefetchStarted = resolve;
        });
        let releasePrefetch!: () => void;
        const pause = new Promise<void>((resolve) => {
          releasePrefetch = resolve;
        });
        let lockCalls = 0;
        let cacheKey = "";
        enableLockPath(vi.fn(async (
          name: string,
          _options: { signal?: AbortSignal },
          work: (lock: Lock) => Promise<unknown>,
        ) => {
          cacheKey = name.slice("graffiti:inbox:".length);
          if (++lockCalls === 2) {
            markPrefetchStarted();
            await pause;
          }
          return work({ name, mode: "exclusive" });
        }));
        vi.stubGlobal("fetch", vi.fn(async () => queryPage([message], "cursor-1", true)));

        const iterator = inboxes.query(inboxUrl, [new Uint8Array([1])], {});
        expect((await iterator.next()).value).toEqual(message);
        await prefetchStarted;
        await inboxes.deleteCachedQuery(cacheKey);
        releasePrefetch();
        await expect(iterator.next()).rejects.toBeInstanceOf(
          GraffitiErrorCursorExpired,
        );
      });

      test("a later query reads messages from the cached server cursor", async () => {
        const fetch = vi.fn()
          .mockResolvedValueOnce(queryPage([message], "cursor-1"))
          .mockResolvedValueOnce(queryPage([], "cursor-2"));
        vi.stubGlobal("fetch", fetch);
        const inboxes = new Inboxes();
        const tags = [new Uint8Array([1])];

        const first = inboxes.query(inboxUrl, tags, {});
        expect((await first.next()).value).toEqual(message);
        expect((await first.next()).done).toBe(true);

        const second = inboxes.query(inboxUrl, tags, {});
        expect((await second.next()).value).toEqual(message);
        expect((await second.next()).done).toBe(true);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch.mock.calls[1][0]).toBe(`${inboxUrl}/query?cursor=cursor-1`);
      });

      test("does not hold the query lock while a message is yielded", async () => {
        const inboxes = new TestInboxes();
        await inboxes.prepareCache();
        let held = false;
        enableLockPath(vi.fn(async (
          key: string,
          _options: { ifAvailable?: boolean },
          callback: (lock: Lock) => Promise<unknown>,
        ) => {
          held = true;
          try {
            return await callback({ name: key, mode: "exclusive" });
          } finally {
            held = false;
          }
        }));
        vi.stubGlobal("fetch", vi.fn(async () => queryPage([message], "cursor-1")));

        const iterator = inboxes.query(inboxUrl, [new Uint8Array([1])], {});
        try {
          expect((await iterator.next()).value).toEqual(message);
          expect(held).toBe(false);
        } finally {
          await iterator.return("");
        }
      });

      test("closing a yielded query leaves no lock held", async () => {
        const inboxes = new TestInboxes();
        await inboxes.prepareCache();
        let held = false;
        enableLockPath(vi.fn(async (
          key: string,
          _options: { ifAvailable?: boolean },
          callback: (lock: Lock) => Promise<unknown>,
        ) => {
          held = true;
          try {
            return await callback({ name: key, mode: "exclusive" });
          } finally {
            held = false;
          }
        }));
        vi.stubGlobal("fetch", vi.fn(async () => queryPage([message], "cursor-1")));

        const iterator = inboxes.query(inboxUrl, [new Uint8Array([1])], {});
        expect((await iterator.next()).value).toEqual(message);
        expect(held).toBe(false);
        await iterator.return("");
        expect(held).toBe(false);
      });

      test("concurrent queries reuse a page fetched under the lock", async () => {
        const inboxes = new TestInboxes();
        await inboxes.prepareCache();
        let releasePrevious = Promise.resolve();
        let requests = 0;
        let bothRequested!: () => void;
        const ready = new Promise<void>((resolve) => { bothRequested = resolve; });
        enableLockPath(vi.fn(async (
          key: string,
          _options: { signal?: AbortSignal },
          callback: (lock: Lock) => Promise<unknown>,
        ) => {
          requests++;
          if (requests === 2) bothRequested();
          const previous = releasePrevious;
          let release!: () => void;
          releasePrevious = new Promise<void>((resolve) => { release = resolve; });
          await previous;
          try {
            return await callback({ name: key, mode: "exclusive" });
          } finally {
            release();
          }
        }));
        const nextMessage = { ...message, id: "message-2" };
        const fetch = vi.fn(async () => {
          await ready;
          return fetch.mock.calls.length === 1
            ? queryPage([message], "cursor-1", true)
            : queryPage([nextMessage], "cursor-2");
        });
        vi.stubGlobal("fetch", fetch);

        const tags = [new Uint8Array([1])];
        const first = inboxes.query(inboxUrl, tags, {});
        const second = inboxes.query(inboxUrl, tags, {});
        const firstPending = first.next();
        const secondPending = second.next();
        const firstResult = await firstPending;
        const secondResult = await secondPending;
        expect(firstResult.value).toEqual(message);
        expect(secondResult.value).toEqual(message);
        const firstNextPending = first.next();
        const secondNextPending = second.next();
        const firstNext = await firstNextPending;
        const secondNext = await secondNextPending;
        expect(firstNext.value).toEqual(nextMessage);
        expect(secondNext.value).toEqual(nextMessage);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect((await first.next()).done).toBe(true);
        expect((await second.next()).done).toBe(true);
      });

    });
  });
}
