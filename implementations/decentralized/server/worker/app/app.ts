import { Hono } from "hono";
import type { Bindings } from "../env";
import webauthn from "./auth/webauthn";
import oauth from "./auth/oauth";
import serviceInstanceManagement from "./service-instances/management";
import handleManagement from "./handles/management";
import actorManagement from "./actors/management";

const app = new Hono<{ Bindings: Bindings }>();

// Do not allow iframe for security
app.use("*", async (c, next) => {
  c.header("X-Frame-Options", "DENY");
  c.header("Access-Control-Allow-Origin", "none");
  await next();
});

// Apply the APIs
app.route("/webauthn", webauthn);
app.route("/oauth", oauth);
app.route("/handles", handleManagement);
app.route("/actors", actorManagement);
app.route("/service-instances", serviceInstanceManagement);

export default app;
