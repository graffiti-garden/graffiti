import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, sep } from "node:path";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const routes = {
  "/decentralized/": resolve(root, "implementations/decentralized/client/dist/browser"),
  "/realtime/": resolve(root, "wrappers/realtime/dist/browser"),
  "/streaming/": resolve(root, "extras/streaming/dist/browser"),
  "/vue-plugin/": resolve(root, "plugins/vue/dist/browser"),
  "/vue/": resolve(root, "node_modules/vue/dist"),
};
const demo = fileURLToPath(new URL("./", import.meta.url));
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    let file = path === "/" ? resolve(demo, "index.html") : path === "/app.js" ? resolve(demo, "app.js") : undefined;
    if (path === "/cursors/") file = resolve(root, "wrappers/realtime/demo/index.html");
    for (const [prefix, directory] of Object.entries(routes)) {
      if (!path.startsWith(prefix)) continue;
      const candidate = resolve(directory, path.slice(prefix.length));
      if (candidate.startsWith(directory + sep) && /\.(js|mjs|wasm)$/.test(candidate)) file = candidate;
    }
    if (!file || !["GET", "HEAD"].includes(request.method)) { response.writeHead(404).end(); return; }
    const body = await readFile(file);
    response.writeHead(200, {
      "Content-Type": file.endsWith(".html") ? "text/html; charset=utf-8"
        : file.endsWith(".wasm") ? "application/wasm" : "text/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 500).end();
  }
});
const port = Number(process.env.STREAMING_DEMO_PORT || 52283);
server.listen(port, "127.0.0.1", () => console.log(`Streaming demo: http://localhost:${port}/`));
