import { Hono } from "hono";
import type { Bindings } from "../env";
import { HTTPException } from "hono/http-exception";
import { verifySessionHeader } from "../app/auth/session";
import { upgradeWebSocket } from "hono/cloudflare-workers";

const indexers = new Hono<{ Bindings: Bindings }>();

indexers.use("*", async (c, next) => {
  // Disable CORs
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  await next();
});

indexers.post("/announce-post/:indexer-id", async (c) => {
  return c.json({ TODO: true });
});

indexers.post("/announce-delete/:indexer-id", async (c) => {
  return c.json({ TODO: true });
});

indexers.get(
  "/ws",
  upgradeWebSocket((c) => {
    return {
      onMessage(event, ws) {
        if (event.data === "get") {
        } else if (event.data === "continue") {
        }
        console.log("Message received:", event.data);
        ws.send("Hello!");
      },
      onClose: () => {
        console.log("WebSocket closed");
      },
    };
  }),
);

export default indexers;
