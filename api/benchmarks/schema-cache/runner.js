const params = new URLSearchParams(location.search),
  rounds = Number(params.get("rounds") || 3);
const manifest = await (await fetch("/manifest.json")).json();
const scenarios = [
  { name: "single compile", type: "direct", kind: "low", count: 1 },
  { name: "cold concurrent 32", type: "direct", kind: "concurrent", count: 32 },
  { name: "cloned schemas 80", type: "direct", kind: "cloned", count: 80 },
  {
    name: "same identity 80",
    type: "direct",
    kind: "same-identity",
    count: 80,
  },
  { name: "unique schemas 150", type: "direct", kind: "unique", count: 150 },
  {
    name: "RPC low work depth1",
    type: "rpc",
    kind: "repeated",
    queries: 1,
    objects: 3,
    depth: 1,
  },
  {
    name: "RPC repeated depth1",
    type: "rpc",
    kind: "repeated",
    queries: 12,
    objects: 20,
    depth: 1,
  },
  {
    name: "RPC repeated depth4",
    type: "rpc",
    kind: "repeated",
    queries: 12,
    objects: 20,
    depth: 4,
  },
  {
    name: "RPC unique depth4",
    type: "rpc",
    kind: "unique",
    queries: 40,
    objects: 1,
    depth: 4,
  },
  {
    name: "RPC passthrough depth4",
    type: "rpc",
    kind: "passthrough",
    queries: 12,
    objects: 20,
    depth: 4,
  },
];
if (params.has("only"))
  scenarios.splice(
    0,
    scenarios.length,
    ...scenarios.filter((s) => s.name.includes(params.get("only"))),
  );
const results = [],
  errors = [],
  runId = new Date().toISOString().replace(/[^\dT]/g, "-");
let current;
const status = document.querySelector("#status");
function median(ns) {
  const s = [...ns].sort((a, b) => a - b);
  return s.length % 2
    ? s[(s.length - 1) / 2]
    : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}
const persist = () =>
  fetch("/result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      runId,
      rounds,
      manifest,
      results,
      errors,
      userAgent: navigator.userAgent,
      logicalCpus: navigator.hardwareConcurrency,
      timeOrigin: performance.timeOrigin,
      visibility: document.visibilityState,
      completed: results.length === scenarios.length * rounds * 2 + 2,
    }),
  });
function trial(scenario, mode, round) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.sandbox.add("allow-scripts");
    const id = crypto.randomUUID();
    const requested = performance.now();
    frame.src =
      "/frame.html#" +
      encodeURIComponent(
        JSON.stringify({
          id,
          mode,
          scenario,
          level: 0,
          debug: params.has("debug"),
        }),
      );
    document.body.append(frame);
    const timer = setTimeout(() => done(Error("Trial timeout")), 60000);
    function done(error, result) {
      clearTimeout(timer);
      removeEventListener("message", receive);
      frame.remove();
      if (error) reject(error);
      else resolve(result);
    }
    function receive(event) {
      if (event.source !== frame.contentWindow || event.data?.id !== id) return;
      if (event.origin !== "null")
        return done(Error("Fixture frame is not opaque"));
      if (event.data.type === "ready") {
        current = {
          readyMs: performance.now() - requested,
          started: performance.now(),
        };
        frame.contentWindow.postMessage({ type: "start" }, "*");
      }
      if (event.data.type === "error")
        done(Error(event.data.error + "\n" + event.data.stack));
      if (event.data.type === "done")
        done(null, {
          scenario: scenario.name,
          config: scenario,
          mode,
          round,
          opaqueOriginVerified: true,
          readyMs: current.readyMs,
          hostElapsedMs: performance.now() - current.started,
          ...event.data.result,
        });
    }
    addEventListener("message", receive);
  });
}
try {
  for (let round = 0; round < rounds; round++) {
    // Deterministic rotation reverses scenario order, while each pair alternates modes.
    const order = round % 2 ? [...scenarios].reverse() : scenarios;
    for (let index = 0; index < order.length; index++)
      for (const mode of (round + index) % 2
        ? ["patched", "baseline"]
        : ["baseline", "patched"]) {
        const scenario = order[index];
        status.textContent = `Round ${round + 1}/${rounds}: ${scenario.name}, ${mode}`;
        const result = await trial(scenario, mode, round);
        results.push(result);
        const correct =
          !result.failures?.length &&
          (result.objects === undefined ||
            result.objects === result.expectedObjects);
        document
          .querySelector("#rows")
          .insertAdjacentHTML(
            "beforeend",
            `<tr><td>${round + 1}</td><td>${scenario.name}</td><td>${mode}</td><td>${result.ms.toFixed(2)}</td><td>${result.instances}</td><td>${result.ajvCacheTotal}</td><td>${correct ? "PASS" : "FAIL"}</td></tr>`,
          );
        if (!correct) throw Error("Correctness check failed");
        await persist();
        await new Promise((r) => setTimeout(r, 100));
      }
  }
  for (const mode of ["baseline", "patched"]) {
    const result = await trial(
      { name: "reference and permission compatibility", type: "compatibility" },
      mode,
      rounds,
    );
    results.push(result);
    await persist();
  }
  const summary = scenarios.map((s) => {
    const a = results.filter(
        (r) => r.scenario === s.name && r.mode === "baseline",
      ),
      b = results.filter((r) => r.scenario === s.name && r.mode === "patched");
    return {
      scenario: s.name,
      baselineMedianMs: median(a.map((r) => r.ms)),
      patchedMedianMs: median(b.map((r) => r.ms)),
      baselineCache: a.map((r) => r.ajvCacheTotal),
      patchedCache: b.map((r) => r.ajvCacheTotal),
    };
  });
  document.querySelector("#summary").textContent = JSON.stringify(
    { summary, compatibility: results.slice(-2) },
    null,
    2,
  );
  status.textContent = `Complete: ${results.length} trials. Results saved by local host server. Run ${runId}`;
  await persist();
} catch (e) {
  errors.push(String(e));
  status.textContent = "ERROR: " + e;
  await persist();
}
