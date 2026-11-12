import { GraffitiRpcClient } from "../../../wrappers/iframe-rpc/client/index.ts";
import { serveGraffiti } from "../../../wrappers/iframe-rpc/host/index.ts";
const config = JSON.parse(decodeURIComponent(location.hash.slice(1)));
const debug = (label: string) => {
  if (config.debug)
    void fetch("/debug", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        id: config.id,
        level: config.level,
        label,
        time: performance.now(),
      }),
    });
};
debug("frame entry");
const longTasks: any[] = [];
try {
  new PerformanceObserver((list) => {
    for (const e of list.getEntries())
      longTasks.push({ start: e.startTime, ms: e.duration });
  }).observe({ type: "longtask", buffered: true });
} catch {}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const send = (type: string, data: any = {}) =>
  parent.postMessage(
    { fixture: true, type, id: config.id, level: config.level, ...data },
    "*",
  );
let child: HTMLIFrameElement | undefined;
let start = 0,
  end = 0;
function metrics() {
  return {
    level: config.level,
    origin: "opaque sandbox; parent verifies message origin",
    longTasks: longTasks.filter((x) => x.start < end && x.start + x.ms > start),
    windowMs: end - start,
  };
}
function makeChild(api: any) {
  debug("creating child and host");
  child = document.createElement("iframe");
  child.sandbox.add("allow-scripts");
  // Distinct document URLs avoid Chromium's recursive same-URL frame blocking;
  // hash-only differences do not distinguish nested documents for that check.
  child.src =
    "/frame.html?level=" +
    (config.level + 1) +
    "#" +
    encodeURIComponent(JSON.stringify({ ...config, level: config.level + 1 }));
  document.body.append(child);
  const host = serveGraffiti(api);
  host.connect({
    remoteWindow: child.contentWindow!,
    channel: `fixture-${config.level + 1}`,
    timeout: 15000,
  });
  return host;
}
async function run() {
  if (config.level === 0) {
    const module = await import(`/${config.mode}-kernel.js`);
    debug("kernel loaded");
    if (
      config.scenario.type === "direct" ||
      config.scenario.type === "compatibility"
    ) {
      addEventListener("message", async (event) => {
        if (event.source !== parent || event.data?.type !== "start") return;
        try {
          start = performance.now();
          const result =
            config.scenario.type === "direct"
              ? await module.direct(config.scenario)
              : await module.compatibility();
          end = performance.now();
          await pause(80);
          send("done", { result: { ...result, frames: [metrics()] } });
        } catch (e) {
          send("error", { error: String(e), stack: (e as Error).stack });
        }
      });
      send("ready");
      return;
    }
    const api = module.kernel(config.scenario);
    makeChild(api);
    api.sessionEvents.dispatchEvent(new CustomEvent("initialized"));
    debug("kernel initialized");
    addEventListener("message", async (event) => {
      if (event.source === parent && event.data?.type === "start") {
        start = performance.now();
        child!.contentWindow!.postMessage({ type: "start" }, "*");
      }
      if (event.source !== child!.contentWindow || !event.data?.fixture) return;
      if (event.data.type === "ready") {
        debug("child ready");
        send("ready");
      }
      if (event.data.type === "done") {
        end = performance.now();
        await pause(80);
        send("done", {
          result: {
            ...event.data.result,
            ...module.stats(),
            frames: [metrics(), ...event.data.result.frames],
          },
        });
      }
      if (event.data.type === "error")
        send("error", { error: event.data.error, stack: event.data.stack });
    });
    return;
  }
  const client = new GraffitiRpcClient({
    remoteWindow: parent,
    channel: `fixture-${config.level}`,
    timeout: 15000,
  });
  client.sessionEvents.addEventListener("initialized", () =>
    debug("client initialized"),
  );
  if (config.level < config.scenario.depth) {
    makeChild(client);
    addEventListener("message", async (event) => {
      if (event.source === parent && event.data?.type === "start") {
        start = performance.now();
        child!.contentWindow!.postMessage({ type: "start" }, "*");
      }
      if (event.source !== child!.contentWindow || !event.data?.fixture) return;
      if (event.data.type === "ready") {
        debug("child ready");
        send("ready");
      }
      if (event.data.type === "done") {
        end = performance.now();
        await pause(80);
        send("done", {
          result: {
            ...event.data.result,
            frames: [metrics(), ...event.data.result.frames],
          },
        });
      }
      if (event.data.type === "error")
        send("error", { error: event.data.error, stack: event.data.stack });
    });
  } else {
    client.sessionEvents.addEventListener(
      "initialized",
      () => {
        debug("leaf ready");
        send("ready");
      },
      { once: true },
    );
    addEventListener("message", async (event) => {
      if (event.source !== parent || event.data?.type !== "start") return;
      try {
        start = performance.now();
        let objects = 0,
          firstMs: number | undefined;
        // Schema transmitted through real wrapper JSON cloning and postMessage.
        const base = {
          properties: {
            value: {
              type: "object",
              required: [
                "name",
                "research interests",
                "open to meeting",
                "time",
              ],
              properties: {
                name: { type: "string", minLength: 1 },
                "profile picture": { type: "string" },
                "profile picture description": {
                  type: "string",
                  minLength: 1,
                  maxLength: 200,
                },
                pronouns: { type: "string" },
                "research interests": { type: "string", minLength: 1 },
                "presentation IDs": {
                  type: "array",
                  items: { anyOf: [{ type: "number" }, { type: "string" }] },
                },
                "open to meeting": { type: "boolean" },
                "how to reach me": { type: "string" },
                role: { type: "string" },
                opportunities: {
                  type: "array",
                  items: { type: "string" },
                  uniqueItems: true,
                },
                time: { type: "number" },
              },
            },
          },
        };
        await Promise.all(
          Array.from({ length: config.scenario.queries }, async (_, i) => {
            const schema = structuredClone(base);
            if (config.scenario.kind === "unique")
              (schema.properties.value.properties as any).type = {
                const: `Profile${i}`,
              };
            for await (const result of client.discover(
              [`fixture:${i}`],
              schema,
            )) {
              if (firstMs === undefined) firstMs = performance.now() - start;
              if (!("object" in result))
                throw Error("unexpected fixture stream shape");
              objects++;
            }
          }),
        );
        end = performance.now();
        await pause(80);
        send("done", {
          result: {
            ms: end - start,
            firstMs,
            objects,
            expectedObjects: config.scenario.queries * config.scenario.objects,
            frames: [metrics()],
          },
        });
      } catch (e) {
        send("error", { error: String(e), stack: (e as Error).stack });
      }
    });
  }
}
run().catch((e) => send("error", { error: String(e), stack: e.stack }));
