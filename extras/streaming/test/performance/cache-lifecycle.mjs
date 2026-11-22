// Control for the performance fixture: WebKit's nonpersistent Cache Storage
// can lose writes after closing a page. No Graffiti or media is involved.
import { webkit } from "playwright";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const server = createServer((_request, response) => {
  response.setHeader("Content-Type", "text/html");
  response.end("<title>Cache lifecycle control</title>");
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  for (const persistent of [false, true]) {
    const profile = await mkdtemp(join(tmpdir(), "graffiti-cache-control-"));
    const browser = persistent ? undefined : await webkit.launch();
    const context = persistent ? await webkit.launchPersistentContext(profile) : await browser.newContext();
    try {
      for (let run = 0; run < 2; run++) {
        const page = await context.newPage();
        await page.goto(origin);
        const result = await page.evaluate(async () => {
          const cache = await caches.open("probe");
          const key = "https://graffiti.invalid/?key=clock";
          const previous = await cache.match(key);
          await cache.put(key, new Response(new Uint8Array([42])));
          const next = await cache.match(key);
          return { retained: !!previous, written: !!next, entries: (await cache.keys()).length };
        });
        console.log(JSON.stringify({ persistent, run, ...result }));
        await page.close();
      }
    } finally {
      await context.close();
      await browser?.close();
      await rm(profile, { recursive: true, force: true });
    }
  }
} finally {
  await new Promise(resolve => server.close(resolve));
}
