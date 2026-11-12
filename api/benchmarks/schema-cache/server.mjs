import http from "node:http";
import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = path.dirname(fileURLToPath(import.meta.url)),
  root = path.join(dir, "public");
await mkdir(path.join(dir, "results"), { recursive: true });
const server = http.createServer(async (req, res) => {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "POST" && req.url === "/debug") {
      let text = "";
      for await (const chunk of req) text += chunk;
      await appendFile(path.join(dir, "results/debug.jsonl"), text + "\n");
      res.end("saved");
      return;
    }
    if (req.method === "POST" && req.url === "/result") {
      let text = "";
      for await (const chunk of req) {
        text += chunk;
        if (text.length > 3000000) throw Error("too large");
      }
      const data = JSON.parse(text);
      if (!/^[\dT-]+$/.test(data.runId)) throw Error("bad id");
      await writeFile(
        path.join(dir, "results", data.runId + ".json"),
        JSON.stringify(data, null, 2),
      );
      res.end("saved");
      console.log(
        JSON.stringify({
          run: data.runId,
          trials: data.results.length,
          errors: data.errors,
          completed: data.completed,
        }),
      );
      return;
    }
    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = path.resolve(root, "." + pathname);
    if (!file.startsWith(root + "/")) throw Error("bad path");
    const data = await readFile(file);
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".html")
          ? "text/html"
          : file.endsWith(".map")
            ? "application/json"
            : "application/octet-stream",
    );
    res.end(data);
  } catch (e) {
    res.statusCode = 500;
    res.end(String(e));
  }
});
server.listen(4178, "127.0.0.1", () =>
  console.log("AJV browser fixture http://127.0.0.1:4178/?rounds=3"),
);
