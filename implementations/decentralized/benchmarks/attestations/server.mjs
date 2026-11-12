import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL(".", import.meta.url)),
  root = path.join(dir, "public");
await mkdir(path.join(dir, "results"), { recursive: true });
http
  .createServer(async (req, res) => {
    try {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-store");
      if (req.method === "POST" && req.url === "/result") {
        let text = "";
        for await (const c of req) {
          text += c;
          if (text.length > 2000000) throw Error("too large");
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
            state: data.state,
            trials: data.results.length,
            error: data.error,
          }),
        );
        return;
      }
      const url = new URL(req.url, "http://localhost"),
        file = path.resolve(
          root,
          "." + (url.pathname === "/" ? "/index.html" : url.pathname),
        );
      if (!file.startsWith(root + "/")) throw Error("bad path");
      res.setHeader(
        "Content-Type",
        file.endsWith(".js")
          ? "text/javascript"
          : file.endsWith(".html")
            ? "text/html"
            : "application/json",
      );
      res.end(await readFile(file));
    } catch (e) {
      res.statusCode = 500;
      res.end(String(e));
    }
  })
  .listen(4179, "127.0.0.1", () => console.log("http://127.0.0.1:4179/"));
