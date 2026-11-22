// Reproduce reused Cache keys across page reloads and browser restarts.
// Temporary profiles only; no camera, microphone, accounts, or remote services.
import { webkit } from "playwright";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const server = createServer((_request, response) => response.end("<title>Cache reload control</title>"));
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const results = [];
const profile = await mkdtemp(join(tmpdir(), "graffiti-cache-reload-"));
let context;
try {
  for (const phase of ["fresh", "restart"]) {
    context = await webkit.launchPersistentContext(profile);
    const page = await context.newPage();
    await page.goto(origin);
    for (const mode of ["open", "reload"]) {
      if (mode === "reload") await page.reload();
      const result = await page.evaluate(async ({ phase, mode }) => {
        const results = [];
        for (const shape of ["query", "path"]) for (const headers of [false, true]) {
          const cache = await caches.open(`reload-${shape}-${headers}`);
          const key = value => `https://graffiti.invalid/${shape === "query" ? "?key=" : ""}${encodeURIComponent(value)}`;
          const get = async value => {
            const response = await cache.match(key(value));
            return response ? [...new Uint8Array(await response.arrayBuffer())] : null;
          };
          const put = (name, value) => cache.put(key(name), new Response(new Uint8Array(value),
            headers ? { headers: { "Content-Type": "application/cbor" } } : undefined));
          const before = await get("clock");
          await put("clock", [1]);
          const rewritten = await get("clock");
          const queued = (await cache.keys()).map(request => request.url).filter(url => url !== key("clock"));
          for (let n = 0; n < 1000; n++) {
            await put("clock", [n % 256]);
            const name = `graffiti:did:example:writer/${crypto.randomUUID()}`;
            await put(name, new Uint8Array(4000));
            queued.push(key(name));
            if (queued.length > 256) await cache.delete(queued.shift());
          }
          results.push({ phase, mode, shape, headers, before, rewritten, after: await get("clock"), keys: (await cache.keys()).length });
        }
        return results;
      }, { phase, mode });
      results.push(...result);
      console.log(JSON.stringify(result));
    }
    await context.close();
    context = undefined;
  }
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
  await writeFile("/tmp/graffiti-cache-reload.json", JSON.stringify(results, null, 2));
  await new Promise(resolve => server.close(resolve));
}
