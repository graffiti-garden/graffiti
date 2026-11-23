// Isolate Cache API lookup/enumeration cost from Graffiti, media and the network.
// Uses temporary profiles only; never opens the user's browser data.
import { webkit, firefox } from "playwright";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const engine = process.env.PERF_BROWSER === "firefox" ? firefox : webkit;
const count = Number(process.env.CACHE_HISTORY ?? 10000);
const server = createServer((_request, response) => response.end("<title>Cache scale control</title>"));
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const results = [];
try {
  for (const shape of ["query", "path"]) {
    const profile = await mkdtemp(join(tmpdir(), "graffiti-cache-scale-"));
    const context = await engine.launchPersistentContext(profile);
    try {
      let page = await context.newPage();
      await page.goto(origin);
      page.on("console", message => console.log(message.text()));
      const seeded = await page.evaluate(async ({ count, shape }) => {
        const cache = await caches.open("records");
        const start = performance.now();
        for (let offset = 0; offset < count; offset += 64) {
          await Promise.all(Array.from({ length: Math.min(64, count - offset) }, (_, j) => {
            const key = encodeURIComponent(`graffiti:did:example:writer/${offset + j}-${"x".repeat(150)}`);
            const url = `https://graffiti.invalid/${shape === "query" ? "?key=" : ""}${key}`;
            return cache.put(url, new Response("x".repeat(4000)));
          }));
          if (offset % 4992 === 0) console.log(JSON.stringify({ shape, seeded: offset, ms: Math.round(performance.now() - start) }));
        }
        await cache.put("https://graffiti.invalid/?key=clock", new Response("42"));
        return performance.now() - start;
      }, { count, shape });
      await page.close();
      page = await context.newPage();
      await page.goto(origin);
      const result = await page.evaluate(async ({ count, shape }) => {
        const cache = await caches.open("records");
        const ms = {};
        const time = async (label, work) => {
          const start = performance.now();
          const result = await work();
          ms[label] = performance.now() - start;
          return result;
        };
        const keys = time("keys", () => cache.keys());
        const lock = time("lock", () => navigator.locks.request("cache", async () => {
          await time("getClock", async () => (await cache.match("https://graffiti.invalid/?key=clock")).text());
        }));
        await Promise.all([keys, lock]);
        const lookup = [];
        for (let i = 0; i < 30; i++) {
          const key = encodeURIComponent(`graffiti:did:example:writer/${Math.floor(i * count / 30)}-${"x".repeat(150)}`);
          const url = `https://graffiti.invalid/${shape === "query" ? "?key=" : ""}${key}`;
          await time("lookup", async () => (await cache.match(url)).arrayBuffer());
          lookup.push(ms.lookup);
        }
        delete ms.lookup;
        return { ...ms, lookup };
      }, { count, shape });
      results.push({ engine: engine.name(), count, shape, seeded, ...result });
      console.log(JSON.stringify(results.at(-1)));
    } finally {
      await context.close();
      await rm(profile, { recursive: true, force: true });
    }
  }
} finally {
  await writeFile(`/tmp/graffiti-cache-scale-${engine.name()}-${count}.json`, JSON.stringify(results, null, 2));
  await new Promise(resolve => server.close(resolve));
}
